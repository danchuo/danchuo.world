package world.danchuo.spotify

import java.time.Instant

/**
 * Прослушанное за сутки по ОДНОМУ эпизоду — свёртка всех сессий с ним (PRD §5.6). Эпизод, взятый
 * туда и обратно, приезжает сюда одной строкой: сессий было две, карточка одна.
 *
 * Метаданные снимаются с плеера в момент записи и хранятся вместе с сессией, а не резолвятся
 * заново при чтении: борд показывает историю, а эпизод из каталога Spotify со временем может
 * уехать. Ссылки — те же, что отдаёт `currently-playing`.
 */
data class PodcastListen(
    val episodeId: String,
    /** Сколько реально слушал за сутки, мс (см. [PodcastListenMath]). */
    val listenedMs: Long,
    /** Начало ПЕРВОЙ сессии с этим эпизодом за сутки — по нему выбираются «первые два». */
    val firstListenedAt: Instant,
    val episodeName: String,
    val episodeUrl: String?,
    /** Название шоу — оно же «автор» карточки: издателя (`publisher`) плеер не отдаёт. */
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    /** Полная длительность эпизода, мс; `null` — не приехала. Для строки «47 из 48 мин». */
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
 * - **карточки** — поэпизодно: первые [max] эпизодов дня, набравшие тот же порог.
 *
 * Расходятся они закономерно: двухчасовой эпизод даёт две отметки и одну карточку. Порог заодно
 * отсеивает «ткнул и бросил»: минуты в сумму идут, карточку такой эпизод не получает.
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
     * Карточки дня: эпизоды, набравшие порог, — первые [max] по времени НАЧАЛА, а не по
     * длительности (согласовано с владельцем: «первые два подкаста»). В марафонский день это
     * значит, что самый длинный эпизод может в карточки не попасть, зато его минуты всё равно
     * учтены в [occurrences].
     */
    fun cards(listens: List<PodcastListen>, max: Int): List<PodcastListen> =
        listens.filter { it.listenedMs >= OCCURRENCE_MS }
            .sortedBy { it.firstListenedAt }
            .take(max)
}
