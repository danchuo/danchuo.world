package world.danchuo.reading

import kotlin.math.min

/**
 * Rolls a day of reading into marks on the "Reading" item, by the day's TOTAL rather than per
 * session: 20 minutes in the morning and 20 at night are 40 minutes of reading even though no
 * single session reached the threshold. Threshold, and why minutes and not percent: PRD §5.16.
 */
object ReadingDayRollup {

    /** Minutes per one stop of the item — shared with podcasts. */
    const val OCCURRENCE_MINUTES = 25

    private const val SECONDS_PER_MINUTE = 60
    private const val OCCURRENCE_SECONDS = OCCURRENCE_MINUTES * SECONDS_PER_MINUTE

    /**
     * How many stops the item closes in a day: `min(target, whole thresholds in the sum)`. We
     * divide seconds, not rounded minutes, so 24:59 stays zero and exactly 25:00 gives one.
     */
    fun occurrences(totalSeconds: Int, target: Int): Int =
        if (totalSeconds <= 0) 0 else min(target, totalSeconds / OCCURRENCE_SECONDS)

    /** Minutes read for the item's caption — rounded down to a whole. */
    fun minutes(totalSeconds: Int): Int = if (totalSeconds <= 0) 0 else totalSeconds / SECONDS_PER_MINUTE

    /**
     * The day's cards: the first [max] sessions that pushed the running total past another 25
     * minutes — "which sitting closed this stop". Sessions must arrive in chronological order or
     * the wrong one is called first. Same rule as podcasts, divergences included. PRD §5.16
     */
    fun cards(sessions: List<ReadingSession>, max: Int): List<ReadingSession> {
        val cards = mutableListOf<ReadingSession>()
        var total = 0
        for (session in sessions) {
            if (cards.size >= max) break
            val closedBefore = total / OCCURRENCE_SECONDS
            total += session.readSeconds
            if (total / OCCURRENCE_SECONDS > closedBefore) cards += session
        }
        return cards
    }
}
