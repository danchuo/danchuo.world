package world.danchuo.health

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Кусок «осознанности» как пришёл с ingest'а: только границы — фазы у него нет. */
data class MindfulSegment(val start: Instant, val end: Instant)

/**
 * Раскладка минут «осознанности» по **вечерним окнам** дня (PRD §5.6).
 *
 * Приложение «Журнал» пишет время, проведённое в нём, в HealthKit как Mindful Minutes —
 * значит пункт «дневник перед сном» можно не отмечать руками. Но календарные сутки для
 * этого не годятся: запись в 00:40 — это конец уходящего дня, а не начало наступившего,
 * и полночь разрезала бы один вечер надвое, роняя обе половины ниже порога.
 *
 * Поэтому дню D принадлежит окно `[D windowStart, D+1 windowEnd)` (по умолчанию 19:00 → 02:00).
 * Кусок, попавший в окно частично, **обрезается** по краям: дневное сидение в приложении не
 * должно вытягивать вечернюю галочку. Пересечения сливаются до подсчёта — Shortcuts не
 * дедуплицирует семплы (та же грабля, что удваивала ночь до [SleepSessionizer]).
 *
 * Как и у сна, окно выборки в шорткате ничего не решает: он тащит с запасом (34 часа —
 * две вечерние корзины), лишнее отбрасывается здесь. Поэтому полуночный прогон дозакрывает
 * вчерашний день, а не теряет его хвост после полуночи.
 */
object JournalDetector {

    /**
     * Минуты «осознанности» по дням-владельцам окна; дни без минут в карту не попадают.
     * [windowEnd] не позже [windowStart] ⇒ окно переходит на следующие сутки (обычный случай).
     */
    fun minutesByDay(
        segments: List<MindfulSegment>,
        windowStart: LocalTime,
        windowEnd: LocalTime,
        zone: ZoneId,
    ): Map<LocalDate, Int> {
        val merged = merge(segments)
        if (merged.isEmpty()) return emptyMap()

        val totals = mutableMapOf<LocalDate, Long>()
        for (interval in merged) {
            // Окно шире суток, поэтому кусок могут делить только соседние дни: хватает
            // кандидатов от «дня начала минус один» до «дня конца».
            var day = interval.start.atZone(zone).toLocalDate().minusDays(1)
            val last = interval.end.atZone(zone).toLocalDate()
            while (!day.isAfter(last)) {
                val (from, to) = window(day, windowStart, windowEnd, zone)
                val overlapFrom = maxOf(interval.start, from)
                val overlapTo = minOf(interval.end, to)
                if (overlapTo.isAfter(overlapFrom)) {
                    totals.merge(day, Duration.between(overlapFrom, overlapTo).seconds, Long::plus)
                }
                day = day.plusDays(1)
            }
        }
        return totals
            .mapValues { (_, seconds) -> Math.round(seconds / 60.0).toInt() }
            .filterValues { it > 0 }
    }

    /** Границы вечернего окна дня [day] в моментах времени. */
    private fun window(
        day: LocalDate,
        start: LocalTime,
        end: LocalTime,
        zone: ZoneId,
    ): Pair<Instant, Instant> {
        val closesNextDay = !end.isAfter(start)
        val from = day.atTime(start).atZone(zone).toInstant()
        val to = (if (closesNextDay) day.plusDays(1) else day).atTime(end).atZone(zone).toInstant()
        return from to to
    }

    /** Слияние пересекающихся и стыкующихся кусков: одно и то же время считается один раз. */
    private fun merge(segments: List<MindfulSegment>): List<MindfulSegment> {
        val valid = segments.filter { it.end.isAfter(it.start) }.sortedBy { it.start }
        val merged = mutableListOf<MindfulSegment>()
        for (segment in valid) {
            val last = merged.lastOrNull()
            if (last != null && !segment.start.isAfter(last.end)) {
                if (segment.end.isAfter(last.end)) {
                    merged[merged.lastIndex] = last.copy(end = segment.end)
                }
            } else {
                merged += segment
            }
        }
        return merged
    }
}
