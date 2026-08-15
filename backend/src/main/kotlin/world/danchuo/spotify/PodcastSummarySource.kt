package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.llm.LlmAudio
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmLane
import world.danchuo.summary.SummaryExcerpt
import world.danchuo.summary.SummaryKind
import world.danchuo.summary.SummarySource
import world.danchuo.summary.SummaryTarget
import world.danchuo.summary.SummaryWindows

/**
 * Откуда берётся текст прослушанного куска (PRD §5.16.1) — половина пересказа, знающая про
 * подкасты. Вторая половина (очередь, попытки, промпт, разбор) живёт в слайсе `summary` и про
 * RSS с расшифровкой ничего не знает.
 *
 * **Готовых транскриптов нет.** Публичного API транскриптов у Spotify не существует, а тег
 * `<podcast:transcript>` по фонотеке владельца нашёлся у 0 выпусков из 6 — включая крупные
 * американские шоу, у которых он вероятнее всего. Поэтому текст добывается своей расшифровкой,
 * и путь такой: каталог Apple → RSS-фид → окна аудио по `Range` → распознавание на бесплатной
 * полосе.
 *
 * **Режем ДО расшифровки.** Час речи — 46 тысяч знаков при потолке выдержки в 12 тысяч, так что
 * расшифровка целого захода была бы выброшена нарезкой окон почти вся. Четыре окна по три
 * минуты стоят 720 аудиосекунд вместо нескольких тысяч и отвечают на тот же вопрос
 * ([AudioWindows]).
 *
 * **Мимо проходят Spotify-эксклюзивы.** У них нет открытого RSS, брать аудио неоткуда — кнопки
 * не будет, и это то же честное пустое место, что у книги без файла на полке.
 */
@ApplicationScoped
class PodcastSummarySource(
    private val sessions: PodcastSessionRepository,
    private val listens: PodcastListenService,
    private val audio: PodcastAudioClient,
    private val llm: LlmClient,
    private val config: SpotifyConfig,
    private val mskTime: MskTime,
) : SummarySource {

    private val log: Logger = Logger.getLogger(PodcastSummarySource::class.java)

    override fun kind(): SummaryKind = SummaryKind.PODCAST

    override fun isConfigured(): Boolean = config.podcast().summary().enabled()

    /**
     * Заходы, из которых МОЖНО вырезать кусок: известны оба конца окна внутри выпуска и его
     * длительность. Свежие вперёд — борд смотрят с сегодняшнего дня.
     *
     * Начало окна пишется с той ветки, где появилась колонка `start_progress_ms`; у всего, что
     * записано раньше, его нет и не появится — такие заходы в очередь не идут вовсе. Выдумать
     * начало было бы тем же сортом вранья, что пересказ по памяти модели.
     *
     * Транзакция здесь и заканчивается: наружу уходит снимок, а не прицепленные сущности.
     */
    @Transactional
    override fun candidates(): List<SummaryTarget> {
        val gap = config.podcast().runGapMinutes()
        return sessions.datesWithWindow(mskTime.today(), HISTORY_DAYS).flatMap { date ->
            PodcastDayRollup.runs(listens.runsOn(date), gap).mapNotNull(::targetOf)
        }
    }

    /**
     * Заход в цель очереди; `null` — резать нечего (нет начала окна, нет длительности, окно
     * пустое).
     *
     * Доли считаются от длительности выпуска, а сама привязка к байтам — от размера файла
     * ([AudioWindows]): так дрейф между длительностью в Spotify и в фиде не копится.
     */
    private fun targetOf(run: PodcastRun): SummaryTarget? {
        val duration = run.episodeDurationMs?.takeIf { it > 0 } ?: return null
        val start = run.startProgressMs ?: return null
        val end = run.lastProgressMs
        if (end <= start) return null

        return SummaryTarget(
            kind = SummaryKind.PODCAST,
            sessionId = run.sessionId,
            title = run.episodeName,
            byline = run.showName,
            from = (start.toDouble() / duration).coerceIn(0.0, 1.0),
            to = (end.toDouble() / duration).coerceIn(0.0, 1.0),
            // Длительность нужна на добыче — по ней сверяется выпуск в фиде и меряются окна.
            ref = duration.toString(),
        )
    }

    /**
     * Текст прослушанного куска. `null` на любом шаге пути — фида нет, выпуск не опознан,
     * раздача не отдаёт куски, распознавание промолчало: всё это значит одно — рассказывать
     * нечего, и очередь честно засчитает промах.
     */
    override fun excerpt(target: SummaryTarget): SummaryExcerpt? {
        val duration = target.ref?.toLongOrNull()?.takeIf { it > 0 } ?: return null
        val show = target.byline ?: return null

        // Обрыв на любом шаге логируем ОДНОЙ внятной строкой на уровне info, а не debug.
        // Попыток у захода максимум три, так что шумом это не станет, зато «почему у этого
        // выпуска нет кнопки» читается из логов, а не выясняется отладкой по месту.
        fun give(reason: String): SummaryExcerpt? {
            log.infof("podcast: пересказ не собрать («%s» / «%s»): %s", show, target.title, reason)
            return null
        }

        val feedUrl = audio.feedUrl(show) ?: return give("фид шоу не найден в каталоге")
        val feed = audio.feed(feedUrl) ?: return give("фид не доехал ($feedUrl)")
        val enclosure = PodcastFeedParser.enclosureFor(feed, target.title, duration)
            ?: return give("выпуск не опознан в фиде $feedUrl")

        val remote = audio.probe(enclosure) ?: return give("раздача не отдаёт куски ($enclosure)")
        val settings = config.podcast().summary()
        val windows = AudioWindows.windows(
            totalBytes = remote.totalBytes,
            durationMs = duration,
            from = target.from,
            to = target.to,
            count = settings.windows(),
            windowMs = settings.windowMs(),
        ).filter { it.length in 1..settings.maxSliceBytes() }
        if (windows.isEmpty()) return give("окно прослушанного пустое или не влезает в потолок куска")

        val parts = windows.mapNotNull { transcribe(remote, it) }
        if (parts.isEmpty()) return give("ни одно окно не расшифровалось (${windows.size} шт.)")

        // Пропуски между окнами отмечаем тем же маркером, что и у книги: модель должна видеть
        // разрыв, а не сочинять мостик через него.
        val text = parts.joinToString(SummaryWindows.GAP)
        log.infof(
            "podcast: расшифровано %d окон выпуска «%s» (%d знаков)",
            parts.size,
            target.title,
            text.length,
        )
        return SummaryExcerpt(text = text)
    }

    /** Одно окно: скачать кусок и распознать его. `null` — не вышло ни то, ни другое. */
    private fun transcribe(remote: RemoteAudio, window: ByteWindow): String? {
        val bytes = audio.slice(remote.url, window) ?: return null
        return llm.transcribe(
            LlmAudio(bytes = bytes, mediaType = AUDIO_TYPE, fileName = AUDIO_NAME),
            LlmLane.FREE,
        )?.trim()?.ifBlank { null }
    }

    private companion object {
        /**
         * Насколько глубоко в прошлое смотрит очередь. Дальше заглядывать незачем: колонка с
         * началом окна появилась недавно, а старые заходы пересказа всё равно не получат.
         */
        const val HISTORY_DAYS = 60L

        /**
         * Срез потока, а не файл целиком — но именно mp3 (все проверенные раздачи отдают его).
         * Имя несущее: распознавание определяет формат по расширению и безымянную часть
         * отвергает.
         */
        const val AUDIO_TYPE = "audio/mpeg"
        const val AUDIO_NAME = "slice.mp3"
    }
}
