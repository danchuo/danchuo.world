package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.checklist.PodcastMarker
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

/**
 * Один отсчёт плеера: эпизод и положение головки в момент опроса. Всё, что нужно, чтобы
 * продолжить или открыть сессию; метаданные едут вместе, потому что кладутся в строку сессии.
 */
data class EpisodeSample(
    val episodeId: String,
    val progressMs: Long,
    val episodeName: String,
    val episodeUrl: String?,
    val showId: String?,
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    val episodeDurationMs: Long?,
)

/**
 * Запись и чтение прослушанных подкастов (PRD §5.6) — состояние поллера и свёртки дня.
 *
 * Отдельный бин от [PodcastPoller] не для красоты: `@Transactional` — это CDI-перехватчик, а он
 * не срабатывает на вызове метода того же бина. Поллеру нужно писать в БД, значит вызов должен
 * уйти наружу, в соседний бин.
 */
@ApplicationScoped
class PodcastListenService(
    private val sessions: PodcastSessionRepository,
    private val marker: PodcastMarker,
    private val config: SpotifyConfig,
) {

    /**
     * Учесть отсчёт плеера за [date]: продолжить открытую сессию или начать новую. Возвращает
     * зачтённые миллисекунды — ноль означает «ничего не изменилось» (пауза, повтор того же
     * положения), и поллеру не за чем сбрасывать проекцию дня.
     *
     * Продолжаем сессию, только если совпал эпизод И молчание не превысило порог. Смена эпизода
     * и возврат к прежнему дают РАЗНЫЕ сессии — так «туда и обратно» честно ложится двумя
     * строками, а сумма за день от этого не меняется.
     */
    @Transactional
    fun record(sample: EpisodeSample, date: LocalDate, at: Instant): Long {
        val latest = sessions.latestOn(date)
        val credited = if (latest.continues(sample, at)) {
            PodcastListenMath.tickCredit(latest!!.lastProgressMs, latest.endedAt, sample.progressMs, at)
                .also {
                    latest.listenedMs += it
                    latest.lastProgressMs = sample.progressMs
                    latest.endedAt = at
                }
        } else {
            PodcastListenMath.openingCredit(sample.progressMs).also { open(sample, date, at, it) }
        }

        remark(date)
        return credited
    }

    /**
     * Заходы за сутки: строки сессий, склеенные по паузе `run-gap-minutes` (см. [PodcastRun]).
     * Порог хранения рвёт сессию раньше, чем человек считает прослушивание прерванным, поэтому
     * борду сессии отдаются не как есть, а собранными обратно в заходы.
     */
    fun runsOn(date: LocalDate): List<PodcastRun> =
        PodcastDayRollup.runs(
            sessions.listByDate(date).map(::runOf),
            config.podcast().runGapMinutes(),
        )

    /** Суммарно прослушанные минуты за сутки — подпись пункта дисциплины. */
    fun minutesOn(date: LocalDate): Int = PodcastDayRollup.listenedMinutes(totalMsOn(date))

    /** Карточки дня: первые [max] заходов, закрывших остановки (см. [PodcastDayRollup.cards]). */
    fun cardsOn(date: LocalDate, max: Int): List<PodcastRun> =
        PodcastDayRollup.cards(runsOn(date), max)

    /** Пересчитать отметку пункта по сумме минут; ручную отметку [PodcastMarker] не тронет. */
    private fun remark(date: LocalDate) {
        val target = marker.target() ?: return
        marker.mark(date, PodcastDayRollup.occurrences(totalMsOn(date), target))
    }

    /**
     * Сумма зачтённого за сутки. Считается по сырым сессиям, без склейки в заходы: отметки
     * зависят только от минут, а склейка их не меняет — незачем гонять её на каждый опрос.
     */
    private fun totalMsOn(date: LocalDate): Long = sessions.listByDate(date).sumOf { it.listenedMs }

    /** Строка сессии как одиночный заход — дальше соседние склеит [PodcastDayRollup.runs]. */
    private fun runOf(session: PodcastSession) = PodcastRun(
        sessionId = session.id!!,
        episodeId = session.episodeId,
        listenedMs = session.listenedMs,
        startedAt = session.startedAt,
        endedAt = session.endedAt,
        episodeName = session.episodeName,
        episodeUrl = session.episodeUrl,
        showName = session.showName,
        showUrl = session.showUrl,
        imageUrl = session.imageUrl,
        episodeDurationMs = session.episodeDurationMs,
    )

    private fun open(sample: EpisodeSample, date: LocalDate, at: Instant, credited: Long) {
        // IDENTITY-генерация вставляет строку немедленно ⇒ все not-null поля заполняем ДО persist.
        val session = PodcastSession().apply {
            this.date = date
            episodeId = sample.episodeId
            episodeName = sample.episodeName
            episodeUrl = sample.episodeUrl
            showId = sample.showId
            showName = sample.showName
            showUrl = sample.showUrl
            imageUrl = sample.imageUrl
            episodeDurationMs = sample.episodeDurationMs
            startedAt = at
            endedAt = at
            listenedMs = credited
            lastProgressMs = sample.progressMs
            // Откуда пошёл зачёт, оттуда начинается и кусок эпизода: включил с начала —
            // [PodcastListenMath.openingCredit] вернул всю фору, и кусок начинается с нуля;
            // продолжил с середины — форы не было, и кусок начинается с текущего положения.
            startProgressMs = sample.progressMs - credited
        }
        sessions.persist(session)
    }

    /** Тянется ли эта сессия дальше отсчётом [sample]: тот же эпизод и молчание в пределах порога. */
    private fun PodcastSession?.continues(sample: EpisodeSample, at: Instant): Boolean {
        if (this == null || episodeId != sample.episodeId) return false
        val silence = Duration.between(endedAt, at)
        // Отрицательная пауза — сбитые часы; безопаснее начать новую сессию, чем считать дельту.
        return !silence.isNegative && silence <= Duration.ofMinutes(config.podcast().sessionGapMinutes())
    }
}
