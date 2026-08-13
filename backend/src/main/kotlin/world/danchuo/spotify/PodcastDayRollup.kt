package world.danchuo.spotify

import java.time.Duration
import java.time.Instant

/**
 * **Заход** — одно прослушивание одного эпизода глазами борда (PRD §5.6): «взял по дороге на
 * работу», «дослушал вечером». Собирается из строк `podcast_session` склейкой соседних кусков
 * одного эпизода — потому что порог хранения (15 минут молчания) отвечает на другой вопрос:
 * он сделан под опрос плеера раз в минуту и рвёт сессию там, где человек прослушивание
 * прерванным не считает (метро, светофор, обед). Склейка живёт на чтении, запись не трогается.
 *
 * Метаданные снимаются с плеера в момент записи и хранятся вместе с сессией, а не резолвятся
 * заново при чтении: борд показывает историю, а эпизод из каталога Spotify со временем может
 * уехать. Ссылки — те же, что отдаёт `currently-playing`.
 */
data class PodcastRun(
    val episodeId: String,
    /** Сколько реально слушал за этот заход, мс (см. [PodcastListenMath]). */
    val listenedMs: Long,
    /** Начало захода — по нему заходы упорядочены и по нему подписана карточка. */
    val startedAt: Instant,
    /** Последний отсчёт захода: от него меряется пауза до следующего. */
    val endedAt: Instant,
    val episodeName: String,
    val episodeUrl: String?,
    /** Название шоу — оно же «автор» карточки: издателя (`publisher`) плеер не отдаёт. */
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    /** Полная длительность эпизода, мс; `null` — не приехала. Для строки «80 из 85 мин». */
    val episodeDurationMs: Long?,
)

/**
 * Свёртка суток подкастов в отметки пункта и карточки дня (PRD §5.6).
 *
 * Два вопроса считаются по-разному, и это намеренно:
 * - **отметки** — по СУММЕ минут за сутки: каждые полные [OCCURRENCE_MINUTES] закрывают одну
 *   остановку пункта. Порог по минутам, а не по эпизодам и не по «дослушано», — единственная
 *   схема, которая переживает и «два эпизода по 40 минут», и «один двухчасовой пополам»
 *   (рассмотрено и отклонено: `resume_point` c флагом `fully_played` — он молчит про недослушанный
 *   эпизод и не знает, КОГДА и СКОЛЬКО слушали);
 * - **карточки** — по ЗАХОДАМ: первые [max] заходов, каждый из которых перевалил сумму дня через
 *   очередную полную 25-минутку. Проще говоря — карточка показывает, каким заходом закрыта эта
 *   остановка.
 *
 * Расходятся они закономерно: марафон в один присест даёт две отметки и одну карточку — заход-то
 * был один, и второй остановке нечего рассказать сверх первой. Тот же эпизод, взятый по дороге
 * туда и обратно, даёт две отметки и ДВЕ карточки: заходов было два, и они разные.
 *
 * **Рассмотрено и отклонено: карточка на эпизод** (как было до этого). Схема теряла ровно
 * владельческий сценарий — 80 минут одного эпизода двумя заходами рисовались одной карточкой и
 * немым вторым кружком, а все 80 минут подписывались под первым, будто их наслушали разом.
 */
object PodcastDayRollup {

    /** Минут на одну остановку пункта; согласовано с владельцем. */
    const val OCCURRENCE_MINUTES = 25

    private const val MS_PER_MINUTE = 60_000L
    private const val OCCURRENCE_MS = OCCURRENCE_MINUTES * MS_PER_MINUTE

    /**
     * Сколько остановок пункта закрыто за сутки: `min(target, целых порогов в сумме)`.
     * Делим миллисекунды, а не округлённые минуты, — 49:59 остаётся одной остановкой,
     * ровно 50:00 становится двумя.
     */
    fun occurrences(totalListenedMs: Long, target: Int): Int =
        if (totalListenedMs <= 0) 0 else minOf(target.toLong(), totalListenedMs / OCCURRENCE_MS).toInt()

    /** Прослушанные минуты для подписи пункта — вниз до целой. */
    fun listenedMinutes(totalListenedMs: Long): Int =
        if (totalListenedMs <= 0) 0 else (totalListenedMs / MS_PER_MINUTE).toInt()

    /**
     * Заходы дня: сессии, склеенные по паузе [gapMinutes], в хронологическом порядке.
     *
     * Склеиваются только соседние куски ОДНОГО эпизода — смена эпизода рвёт заход независимо от
     * паузы. Сумма минут за день от склейки не меняется вовсе, меняется только то, сколькими
     * карточками день рассказан.
     */
    fun runs(sessions: List<PodcastRun>, gapMinutes: Long): List<PodcastRun> {
        val merged = mutableListOf<PodcastRun>()
        for (next in sessions.sortedBy { it.startedAt }) {
            val previous = merged.lastOrNull()
            if (previous != null && previous.joins(next, gapMinutes)) {
                merged[merged.lastIndex] = previous.copy(
                    listenedMs = previous.listenedMs + next.listenedMs,
                    endedAt = maxOf(previous.endedAt, next.endedAt),
                )
            } else {
                merged += next
            }
        }
        return merged
    }

    /**
     * Карточки дня: первые [max] заходов, перевалившие сумму через очередную 25-минутку.
     *
     * Заход считается один раз, сколько бы порогов он ни перешагнул: двухчасовой присест берёт
     * первую карточку и на вторую не претендует — рассказывать под вторым кружком то же самое
     * значило бы соврать, что заходов было два.
     *
     * Обратная сторона порога по СУММЕ: закрыть остановку может короткий заход, доложивший
     * последние минуты к чужим (24 + 1). Принято сознательно — альтернатива «карточку берёт
     * самый длинный вклад» ровно на владельческом сценарии выдаёт один и тот же заход дважды.
     */
    fun cards(runs: List<PodcastRun>, max: Int): List<PodcastRun> {
        val cards = mutableListOf<PodcastRun>()
        var total = 0L
        for (run in runs.sortedBy { it.startedAt }) {
            if (cards.size >= max) break
            val closedBefore = total / OCCURRENCE_MS
            total += run.listenedMs
            if (total / OCCURRENCE_MS > closedBefore) cards += run
        }
        return cards
    }

    /**
     * Минуты КАЖДОГО эпизода за сутки, по всем его заходам. Знаменатель строки «80 из 85 мин за
     * день» на карточке: сам заход знает только свои 45, а «сколько от эпизода пройдено» —
     * вопрос ко всему дню.
     */
    fun episodeMinutes(runs: List<PodcastRun>): Map<String, Int> =
        runs.groupBy { it.episodeId }
            .mapValues { (_, group) -> listenedMinutes(group.sumOf { it.listenedMs }) }

    /** Тянется ли заход дальше куском [next]: тот же эпизод и пауза в пределах порога склейки. */
    private fun PodcastRun.joins(next: PodcastRun, gapMinutes: Long): Boolean =
        episodeId == next.episodeId &&
            Duration.between(endedAt, next.startedAt) <= Duration.ofMinutes(gapMinutes)
}
