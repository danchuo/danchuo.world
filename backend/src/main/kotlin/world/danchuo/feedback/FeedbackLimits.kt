package world.danchuo.feedback

/**
 * Ceilings for the public note endpoint, equal to the column widths in `1070-feedback`: Postgres
 * does not truncate an over-long value, it fails the insert — and this endpoint takes its input
 * from anybody. The two groups are handled differently on purpose, see [FeedbackPolicy]. §5.19
 */
internal object FeedbackLimits {
    const val ANSWER = 2000
    const val SIGNATURE = 120
    const val PATH = 512
    const val WAVE_KEY = 64
    const val LANGUAGE = 64
    const val USER_AGENT = 512

    /** A screen or viewport edge in px; anything outside is junk and is dropped. */
    const val MAX_PIXELS = 100_000
}
