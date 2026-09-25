package world.danchuo.reading

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
     * How many stops the day closes: whole thresholds in the sum, uncapped — a long day reads "3/2".
     * We divide seconds, not rounded minutes, so 24:59 stays zero and exactly 25:00 gives one.
     */
    fun occurrences(totalSeconds: Int): Int =
        if (totalSeconds <= 0) 0 else totalSeconds / OCCURRENCE_SECONDS

    /** Minutes read for the item's caption — rounded down to a whole. */
    fun minutes(totalSeconds: Int): Int = if (totalSeconds <= 0) 0 else totalSeconds / SECONDS_PER_MINUTE

}
