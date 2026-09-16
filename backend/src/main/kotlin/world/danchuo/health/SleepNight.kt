package world.danchuo.health

import io.quarkus.runtime.annotations.RegisterForReflection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * The night as it was: the minute total answers "how much", the band answers "how" — when sleep
 * started, where it broke, which minutes were awake. Raw segments now survive to the read side
 * instead of collapsing into four numbers and being thrown away. PRD §5.4 (I-23)
 */
object SleepNight {

    /**
     * The waking day's night: its LONGEST session, laid out in time. A day may hold several
     * sessions — a nap also ends today — and all of them count toward the minute total but not
     * toward the band: forty daytime minutes would stretch the axis and flatten the night itself.
     */
    fun of(segments: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): List<SleepSegment> =
        SleepSessionizer.sessionsEndingOn(segments, wakeDate, zone)
            .map { SleepSessionizer.flatten(it) }
            .maxByOrNull { asleepSeconds(it) }
            .orEmpty()

    /** Seconds asleep, excluding wake-ups — as Apple counts "Time Asleep" (§7). */
    internal fun asleepSeconds(parts: List<SleepSegment>): Long = parts
        .filter { it.stage != SleepStage.AWAKE }
        .sumOf { Duration.between(it.start, it.end).seconds }
}

/**
 * Axis of the night band: minutes from 18:00 MSK on the EVE of the waking day. Not from midnight,
 * because a night lies on both sides of it — on a calendar-day axis the evening start would jump
 * to the far end of the scale and tear the band in two. PRD §5.4
 */
object SleepBand {

    /** The MSK hour the axis starts at, which is also the band's coordinate zero. */
    const val AXIS_START_HOUR = 18

    /** Axis length in minutes: exactly one day from [AXIS_START_HOUR] back to itself. */
    const val AXIS_MINUTES = 24 * 60

    fun of(night: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): SleepBandView? {
        if (night.isEmpty()) return null
        val origin = origin(wakeDate, zone)
        val parts = night.map {
            SleepBandPartView(
                // The phone's unlabelled sleep is not a fifth phase but the same light: that is
                // how the day's sum counts it too (§7). The client need not know `unspecified`.
                stage = (if (it.stage == SleepStage.UNSPECIFIED) SleepStage.LIGHT else it.stage).name.lowercase(),
                fromMinute = minuteOf(origin, it.start),
                toMinute = minuteOf(origin, it.end),
            )
        }
        val asleep = night.filter { it.stage != SleepStage.AWAKE }
        return SleepBandView(
            onsetMinute = parts.first().fromMinute,
            wakeMinute = parts.last().toMinute,
            asleepMinutes = Math.round(SleepNight.asleepSeconds(night) / 60.0).toInt(),
            // Sleep may open with a wake-up (lay down, tossed about): the band starts where you
            // lay down, "fell asleep" where the first sleep begins. It cannot be empty — a night
            // without sleep never gets here.
            asleepFromMinute = asleep.firstOrNull()?.let { minuteOf(origin, it.start) } ?: parts.first().fromMinute,
            parts = parts,
        )
    }

    /** Axis zero: 18:00 of the eve in the canonical zone (§4). */
    fun origin(wakeDate: LocalDate, zone: ZoneId): Instant =
        wakeDate.minusDays(1).atTime(AXIS_START_HOUR, 0).atZone(zone).toInstant()

    /**
     * An instant as an axis minute. Anything outside the day is clamped to the edge rather than
     * wrapped: someone asleep before 18:00 must start the band at zero, not land in tomorrow.
     */
    fun minuteOf(origin: Instant, at: Instant): Int =
        Duration.between(origin, at).toMinutes().coerceIn(0L, AXIS_MINUTES.toLong()).toInt()
}

// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).

/** One night's band on the [SleepBand] axis. */
@RegisterForReflection
data class SleepBandView(
    /** The axis minute the night began at (its first chunk, asleep or restless). */
    val onsetMinute: Int,
    /** The axis minute the night ended at. */
    val wakeMinute: Int,
    /** Minutes asleep excluding wake-ups — the same number as in the day's sum. */
    val asleepMinutes: Int,
    /** The minute the first real sleep started at. */
    val asleepFromMinute: Int,
    val parts: List<SleepBandPartView>,
)

/** A band chunk: the phase lowercased (`light`/`deep`/`rem`/`awake`/`unspecified`). */
@RegisterForReflection
data class SleepBandPartView(val stage: String, val fromMinute: Int, val toMinute: Int)
