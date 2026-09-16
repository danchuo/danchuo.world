package world.danchuo.summary

/**
 * What the queue already knows about a sitting: how much has been told, where the last attempt
 * aimed, and how many misses in a row. A snapshot of a [ContentSummary] row without the row, so
 * the queue rules stay arithmetic and can be tested without a database.
 */
data class SummaryState(
    /** Whether there is anything to show right now: the summary succeeded and has points. */
    val ready: Boolean,
    /** How far the stored text reaches; `null` when there has been no success to cover with. */
    val coveredEnd: Double?,
    /** The end of the stretch the LAST attempt aimed at. */
    val targetEnd: Double?,
    val attempts: Int,
)

/**
 * Rules of the summary queue: whom to ask the model about and whom to leave alone. Everything here
 * is about WHAT HAS BEEN TOLD, not how many times we tried. The refresh threshold is not cosmetic
 * — without it, rounding alone would walk the model in circles over two paragraphs. PRD §5.16
 */
object SummaryPolicy {

    /**
     * Whether this is a different target from last time's. Nothing attempted makes the target new
     * by definition.
     */
    fun isNewTarget(previousTargetEnd: Double?, end: Double, refresh: Double): Boolean =
        previousTargetEnd?.let { end - it >= refresh } ?: true

    /**
     * Whether a sitting needs a trip to the model: never asked, or failed with attempts left on
     * THIS target, or told but since moved past the threshold. The attempt cap keeps "I give up"
     * about the target it was aimed at — a grown sitting is a new target. PRD §5.16
     */
    fun queued(end: Double, known: SummaryState?, refresh: Double, maxAttempts: Int): Boolean {
        if (known == null) return true
        if (!isNewTarget(known.targetEnd, end, refresh) && known.attempts >= maxAttempts) return false
        if (!known.ready) return true
        return end - (known.coveredEnd ?: 0.0) >= refresh
    }

    /** Misses in a row credited to the sitting after this attempt (a success zeroes it itself). */
    fun attemptsAfter(known: SummaryState?, end: Double, refresh: Double): Int =
        if (isNewTarget(known?.targetEnd, end, refresh)) 1 else (known?.attempts ?: 0) + 1
}
