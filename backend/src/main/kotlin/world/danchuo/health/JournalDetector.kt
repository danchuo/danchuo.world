package world.danchuo.health

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** A mindfulness chunk as ingest sent it: bounds only, it has no phase. */
data class MindfulSegment(val start: Instant, val end: Instant)

/**
 * Spreads mindfulness minutes into a day's EVENING window `[D windowStart, D+1 windowEnd)`:
 * calendar days would cut one evening in half at midnight and drop both halves below the
 * threshold. Partial segments are clipped and overlaps merged before counting. PRD §5.6
 */
object JournalDetector {

    /**
     * Mindfulness minutes by the day that owns the window; days with no minutes stay out of the
     * map. [windowEnd] no later than [windowStart] means the window crosses into the next day.
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
            // The window is wider than a day, so only adjacent days can split a chunk: candidates
            // from "start day minus one" through "end day" are enough.
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

    /** The evening window bounds of [day] as instants. */
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

    /** Merges overlapping and touching chunks, so the same time is counted once. */
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
