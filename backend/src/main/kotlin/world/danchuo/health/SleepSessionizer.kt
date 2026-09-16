package world.danchuo.health

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException

/**
 * The phase of one sleep segment; names arrive as bare strings from iOS (`REM`, `Deep`, `Core`,
 * `Awake`, `Asleep`). [UNSPECIFIED] means "asleep, phase unknown" — how an iPhone marks a night
 * without a watch. It counts as light but yields to any explicit phase when overlaps are resolved.
 */
enum class SleepStage {
    REM,
    DEEP,
    LIGHT,
    AWAKE,
    UNSPECIFIED,
    ;

    /** An explicit phase beats unlabelled sleep over the same stretch of time. */
    internal val priority: Int get() = if (this == UNSPECIFIED) 0 else 1

    companion object {
        /** Parses a phase name; `null` means not sleep (`In Bed`) or unknown — such a chunk is skipped. */
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

/** A sleep chunk as ingest sent it: phase plus bounds, already parsed into instants. */
data class SleepSegment(val stage: SleepStage, val start: Instant, val end: Instant)

/**
 * Assembles a night out of raw segments, choosing the day BY SESSION END. This lives on the
 * backend because sleep belongs to the waking day while its pieces straddle midnight, and any
 * shortcut filter on a single sample boundary cuts the night short. PRD §5.4, §4
 */
object SleepSessionizer {

    /** The gap that starts a new sleep session. Sample holes inside one night are shorter. */
    private val SESSION_GAP: Duration = Duration.ofMinutes(60)

    private val NONE = SleepInput(null, null, null, null, null)

    /**
     * Duration and phases of the sleep someone woke from on [wakeDate] (the day is taken in
     * [zone]). Sessions ending on another day are dropped; a night without sleep means "no
     * data" (§5.4).
     */
    fun summarize(segments: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): SleepInput {
        val ofWakeDate = sessionsEndingOn(segments, wakeDate, zone).flatten()
        if (ofWakeDate.isEmpty()) return NONE

        val seconds = secondsByStage(ofWakeDate)
        val rem = minutes(seconds[SleepStage.REM])
        val deep = minutes(seconds[SleepStage.DEEP])
        val light = minutes((seconds[SleepStage.LIGHT] ?: 0) + (seconds[SleepStage.UNSPECIFIED] ?: 0))
        val awake = minutes(seconds[SleepStage.AWAKE])

        // `Awake` is not sleep, as Apple's "Time Asleep" also counts. Phases sum to the duration
        // by construction: round once, per phase, and add the rounded values.
        val asleep = rem + deep + light
        return if (asleep == 0) NONE else SleepInput(asleep, rem, deep, light, awake)
    }

    /**
     * Parses an instant from the shortcut's string. The main form is ISO with an offset; without
     * one we read it in [zone], and a space instead of `T` is tolerated. Everything else is
     * `null`: silently guessing a time format is more dangerous than answering 400.
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
     * Sessions that ENDED on [wakeDate] — which, by the rule in §4, is that day's sleep. There may
     * be more than one: a daytime nap is just as much a session of the same day.
     */
    internal fun sessionsEndingOn(
        segments: List<SleepSegment>,
        wakeDate: LocalDate,
        zone: ZoneId,
    ): List<List<SleepSegment>> = sessions(segments).filter { session ->
        session.maxOf { it.end }.atZone(zone).toLocalDate() == wakeDate
    }

    /**
     * Segments laid out in time without overlap: time is cut by every boundary and each slice goes
     * to exactly one phase (an explicit one beats [SleepStage.UNSPECIFIED]), so duplicate sources
     * cannot lengthen a night. Equal phases merge; A GAP IN SAMPLES STAYS A GAP — the band shows it.
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

    /** Chunks grouped into sessions: a new one starts where the gap exceeds [SESSION_GAP]. */
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

    /** Seconds per phase: the night laid out in time ([flatten]), folded by phase. */
    private fun secondsByStage(segments: List<SleepSegment>): Map<SleepStage, Long> {
        val totals = mutableMapOf<SleepStage, Long>()
        flatten(segments).forEach { part ->
            totals.merge(part.stage, Duration.between(part.start, part.end).seconds, Long::plus)
        }
        return totals
    }

    private fun minutes(seconds: Long?): Int = Math.round((seconds ?: 0) / 60.0).toInt()
}
