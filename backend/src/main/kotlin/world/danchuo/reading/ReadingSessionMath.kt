package world.danchuo.reading

import java.time.Duration
import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pure reading arithmetic: the reader counts the minutes, our job is to split the growth of its
 * per-book-per-day counter into sittings and attach percentages. THE POLLER HAS NO CURSOR —
 * credit is the difference against our own rows, so a missed tick costs nothing. PRD §5.16
 */
object ReadingSessionMath {

    /**
     * Seconds to credit: the reader's counter less what we already recorded. Zero means nothing
     * changed, and it is never negative — a counter that went backwards (a reinstall, a restored
     * backup) does not subtract what was read, it simply becomes the new level.
     */
    fun credit(shelfSeconds: Int, recordedSeconds: Int): Int = max(0, shelfSeconds - recordedSeconds)

    /**
     * Whether an open session extends. Nothing to extend gives `false`; so does a negative pause
     * (a skewed clock) — starting a new row is safer than stretching the old one back in time.
     */
    fun continues(lastSeenAt: Instant?, at: Instant, gap: Duration): Boolean {
        if (lastSeenAt == null) return false
        val silence = Duration.between(lastSeenAt, at)
        return !silence.isNegative && silence <= gap
    }

    /**
     * Seconds to minutes for the caption. Rounded to nearest, but anything read is at least one
     * minute: "0 min" under a non-empty session reads as a fault, not as "read very little".
     */
    fun minutes(seconds: Int): Int = when {
        seconds <= 0 -> 0
        else -> max(1, (seconds / 60.0).roundToInt())
    }
}
