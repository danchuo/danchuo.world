package world.danchuo.health

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException

/**
 * Фаза одного куска сна. HealthKit пишет ночь не одной записью, а пачкой кусков-фаз;
 * имена приходят голыми строками с iOS (`REM` / `Deep` / `Core` / `Awake` / `Asleep`).
 *
 * [UNSPECIFIED] — «спит, фаза неизвестна»: так iPhone размечает ночь без часов. В итог
 * идёт как light (рисовать отдельную «неизвестную» полосу нечем), но при разборе
 * перекрытий уступает любой явной фазе — часы точнее телефона.
 */
enum class SleepStage {
    REM,
    DEEP,
    LIGHT,
    AWAKE,
    UNSPECIFIED,
    ;

    /** Явная фаза бьёт неразмеченный сон на том же отрезке времени. */
    internal val priority: Int get() = if (this == UNSPECIFIED) 0 else 1

    companion object {
        /** Разбор имени фазы; `null` = «не сон» (`In Bed`) или незнакомое имя — такой кусок пропускаем. */
        fun of(raw: String?): SleepStage? = when (raw?.filter { it.isLetter() }?.lowercase()) {
            "rem", "asleeprem" -> REM
            "deep", "asleepdeep" -> DEEP
            "core", "light", "asleepcore" -> LIGHT
            "awake" -> AWAKE
            "asleep", "asleepunspecified" -> UNSPECIFIED
            else -> null
        }
    }
}

/** Кусок сна как пришёл с ingest'а: фаза + границы (уже разобранные в моменты времени). */
data class SleepSegment(val stage: SleepStage, val start: Instant, val end: Instant)

/**
 * Сборка ночи из сырых кусков сна (PRD §5.4, §4).
 *
 * Зачем это на бэке, а не в шорткате. Сон принадлежит **дню пробуждения**, а куски ночи лежат
 * по обе стороны полуночи. Любой фильтр шортката по одной границе семпла режет ночь: `Start Date
 * is today` теряет вечернее начало целиком, `End Date is today` — куски, закончившиеся до полуночи
 * (уснул 23:20 ⇒ ночь показывалась «с 00:00»). Поэтому шорткат больше не считает: он отдаёт всё
 * подряд за широкое окно, а день выбирается здесь — **по концу сессии**. Ширина окна перестаёт
 * быть настройкой: лишнее просто отбрасывается.
 *
 * Попутно снимаются две грабли шортката: дубли источников (Shortcuts не дедуплицирует семплы —
 * ночь удваивалась) и ночь без часов одним семплом `Asleep` (мимо всех веток If ⇒ ноль).
 */
object SleepSessionizer {

    /** Разрыв, с которого начинается новая сессия сна. Дырки в семплах внутри ночи короче. */
    private val SESSION_GAP: Duration = Duration.ofMinutes(60)

    private val NONE = SleepInput(null, null, null, null, null)

    /**
     * Длительность и фазы сна, из которого проснулись в [wakeDate] (день считается в [zone]).
     * Сессии, закончившиеся в другой день, отбрасываются; ночь без сна ⇒ «нет данных» (§5.4).
     */
    fun summarize(segments: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): SleepInput {
        val ofWakeDate = sessionsEndingOn(segments, wakeDate, zone).flatten()
        if (ofWakeDate.isEmpty()) return NONE

        val seconds = secondsByStage(ofWakeDate)
        val rem = minutes(seconds[SleepStage.REM])
        val deep = minutes(seconds[SleepStage.DEEP])
        val light = minutes((seconds[SleepStage.LIGHT] ?: 0) + (seconds[SleepStage.UNSPECIFIED] ?: 0))
        val awake = minutes(seconds[SleepStage.AWAKE])

        // `Awake` в сон не входит — так же считает Apple «Time Asleep». Сумма фаз = длительность
        // по построению: округляем один раз, каждую фазу, и складываем уже округлённое.
        val asleep = rem + deep + light
        return if (asleep == 0) NONE else SleepInput(asleep, rem, deep, light, awake)
    }

    /**
     * Разбор момента времени из строки шортката. Основная форма — ISO со смещением
     * (`2026-07-27T23:20:00+03:00`); без смещения читаем в [zone], пробел вместо `T` терпим.
     * Всё остальное — `null`: молча угадывать формат времени опаснее, чем ответить 400.
     */
    fun parseInstant(raw: String?, zone: ZoneId): Instant? {
        val text = raw?.trim()?.replace(' ', 'T')?.takeIf { it.isNotEmpty() } ?: return null
        return try {
            OffsetDateTime.parse(text).toInstant()
        } catch (_: DateTimeParseException) {
            try {
                LocalDateTime.parse(text).atZone(zone).toInstant()
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    /**
     * Сессии, ЗАКОНЧИВШИЕСЯ в [wakeDate] — то, что по правилу §4 и есть сон этого дня.
     * Их может быть больше одной: дневной сон — такая же сессия того же дня.
     */
    internal fun sessionsEndingOn(
        segments: List<SleepSegment>,
        wakeDate: LocalDate,
        zone: ZoneId,
    ): List<List<SleepSegment>> = sessions(segments).filter { session ->
        session.maxOf { it.end }.atZone(zone).toLocalDate() == wakeDate
    }

    /**
     * Куски, разложенные во времени без перекрытий. Время режется границами всех кусков, и
     * каждый элементарный отрезок достаётся ровно одной фазе (явная бьёт
     * [SleepStage.UNSPECIFIED], равные — по порядку объявления): поэтому ни дубли источников,
     * ни разметка часов поверх записи телефона не удлиняют ночь сверх реально проведённого
     * времени. Соседние куски одной фазы склеиваются; **дырка в семплах дыркой и остаётся** —
     * полоса ночи (I-23) обязана показать провал, а не замазать его.
     */
    internal fun flatten(segments: List<SleepSegment>): List<SleepSegment> {
        val valid = segments.filter { it.end.isAfter(it.start) }
        val edges = valid.flatMap { listOf(it.start, it.end) }.distinct().sorted()
        val out = mutableListOf<SleepSegment>()
        for (i in 0 until edges.size - 1) {
            val from = edges[i]
            val to = edges[i + 1]
            val winner = valid
                .filter { !it.start.isAfter(from) && !it.end.isBefore(to) }
                .minWithOrNull(compareBy({ -it.stage.priority }, { it.stage.ordinal }))
                ?.stage ?: continue
            val last = out.lastOrNull()
            if (last != null && last.stage == winner && last.end == from) {
                out[out.size - 1] = last.copy(end = to)
            } else {
                out += SleepSegment(winner, from, to)
            }
        }
        return out
    }

    /** Куски, разложенные по сессиям: новая начинается там, где разрыв больше [SESSION_GAP]. */
    private fun sessions(segments: List<SleepSegment>): List<List<SleepSegment>> {
        val valid = segments.filter { it.end.isAfter(it.start) }.sortedBy { it.start }
        val sessions = mutableListOf<MutableList<SleepSegment>>()
        var reach: Instant? = null
        for (segment in valid) {
            if (reach == null || Duration.between(reach, segment.start) > SESSION_GAP) {
                sessions += mutableListOf(segment)
                reach = segment.end
            } else {
                sessions.last() += segment
                if (segment.end.isAfter(reach)) reach = segment.end
            }
        }
        return sessions
    }

    /** Секунды по фазам: разложенная во времени ночь ([flatten]), сложенная по фазам. */
    private fun secondsByStage(segments: List<SleepSegment>): Map<SleepStage, Long> {
        val totals = mutableMapOf<SleepStage, Long>()
        flatten(segments).forEach { part ->
            totals.merge(part.stage, Duration.between(part.start, part.end).seconds, Long::plus)
        }
        return totals
    }

    private fun minutes(seconds: Long?): Int = Math.round((seconds ?: 0) / 60.0).toInt()
}
