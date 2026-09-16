package world.danchuo.spotify

import java.time.Instant

/**
 * Pure arithmetic of podcast listening time. The key to accuracy is counting the PLAYHEAD DELTA
 * rather than the number of polls: a pause yields nothing on its own, a skip forward is clamped by
 * real time, and a rewind brings zero without breaking the session. Measured drift: none. §5.6
 */
object PodcastListenMath {

    /**
     * How close to an episode's start the session's first sample must be for the whole of it to
     * count: one poll interval. Further means the episode was resumed from the middle.
     */
    const val START_TOLERANCE_MS = 60_000L

    /**
     * Credit for a session's first sample. The poll may have caught the episode already running
     * and that head start is worth recovering — but ONLY when the episode began at zero. Resuming
     * yesterday's from minute 20 would otherwise claim time listened to on another day.
     */
    fun openingCredit(progressMs: Long, toleranceMs: Long = START_TOLERANCE_MS): Long =
        if (progressMs in 0..toleranceMs) progressMs else 0

    /**
     * Credit between two adjacent polls of ONE episode: how far the playhead moved, but no more
     * than the real time elapsed. Neither term is ever negative — a pause, a rewind and two
     * samples with the same timestamp all give zero.
     */
    fun tickCredit(
        previousProgressMs: Long,
        previousAt: Instant,
        progressMs: Long,
        at: Instant,
    ): Long {
        val progressDelta = progressMs - previousProgressMs
        val elapsed = at.toEpochMilli() - previousAt.toEpochMilli()
        if (progressDelta <= 0 || elapsed <= 0) return 0
        return minOf(progressDelta, elapsed)
    }
}
