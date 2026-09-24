package world.danchuo.spotify

import java.time.Duration
import java.time.Instant

/**
 * A SITTING — one listen of one episode as the board sees it, glued from adjacent `podcast_session`
 * rows of the same episode. The stored 15-minute gap answers a different question and breaks a
 * sitting where a person would not. Gluing happens on read; the write side is untouched. §5.6
 */
data class PodcastRun(
    /**
     * Id of the FIRST session in the sitting — its key to the outside. A sitting has no id of its
     * own, being glued on read, and this is stable: gluing is deterministic and sessions are only
     * ever appended, so a sitting cannot retroactively begin earlier. PRD §5.16.1
     */
    val sessionId: Long,
    val episodeId: String,
    /** How much was really listened to in this session, ms (see [PodcastListenMath]). */
    val listenedMs: Long,
    /** The session's start — sessions are ordered by it, and the card is captioned by it. */
    val startedAt: Instant,
    /** The session's last sample: the pause to the next one is measured from here. */
    val endedAt: Instant,
    val episodeName: String,
    val episodeUrl: String?,
    /** The show name, which doubles as the card's author: the player returns no `publisher`. */
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    /** Full episode length, ms; `null` when it never arrived. For the "80 of 85 min" line. */
    val episodeDurationMs: Long?,
    /**
     * The slice of the EPISODE covered by this sitting: where credit began and where the playhead
     * stopped. The audio for a summary is cut by it. A `null` start means the row predates our
     * recording it, and such a sitting gets no summary — a beginning must not be invented.
     */
    val startProgressMs: Long? = null,
    val lastProgressMs: Long = 0,
)

/**
 * Rolls a day of podcasts into item marks and day cards. The two are counted DIFFERENTLY on
 * purpose: marks by the day's total minutes, cards by sittings. They diverge predictably — one
 * marathon is two marks and one card, the same episode there and back is two of each. PRD §5.6
 */
object PodcastDayRollup {

    /** Minutes per one stop of the item — shared with reading. */
    const val OCCURRENCE_MINUTES = 25

    private const val MS_PER_MINUTE = 60_000L
    private const val OCCURRENCE_MS = OCCURRENCE_MINUTES * MS_PER_MINUTE

    /**
     * How many stops the item closes in a day: `min(target, whole thresholds in the sum)`. We
     * divide milliseconds, not rounded minutes, so 49:59 stays one stop and exactly 50:00 is two.
     */
    fun occurrences(totalListenedMs: Long, target: Int): Int =
        if (totalListenedMs <= 0) 0 else minOf(target.toLong(), totalListenedMs / OCCURRENCE_MS).toInt()

    /** Minutes listened for the item's caption — rounded down to a whole. */
    fun listenedMinutes(totalListenedMs: Long): Int =
        if (totalListenedMs <= 0) 0 else (totalListenedMs / MS_PER_MINUTE).toInt()

    /**
     * The day's sittings: sessions glued across a [gapMinutes] pause, in chronological order. Only
     * adjacent pieces of ONE episode glue — a change of episode breaks the sitting whatever the
     * pause. Gluing never changes the day's total, only how many cards tell the day.
     */
    fun runs(sessions: List<PodcastRun>, gapMinutes: Long): List<PodcastRun> {
        val merged = mutableListOf<PodcastRun>()
        for (next in sessions.sortedBy { it.startedAt }) {
            val previous = merged.lastOrNull()
            if (previous != null && previous.joins(next, gapMinutes)) {
                // The sitting's key stays the key of its FIRST row: an appended piece continues
                // that sitting rather than opening a new one, so a summary never moves. The
                // episode slice stretches the same way — start from the first row, end from last.
                merged[merged.lastIndex] = previous.copy(
                    listenedMs = previous.listenedMs + next.listenedMs,
                    endedAt = maxOf(previous.endedAt, next.endedAt),
                    lastProgressMs = maxOf(previous.lastProgressMs, next.lastProgressMs),
                )
            } else {
                merged += next
            }
        }
        return merged
    }

    /**
     * The day's cards: the first [max] sittings to push the running total past another 25 minutes.
     * A sitting counts ONCE however many thresholds it crosses — telling the same thing under a
     * second stop would claim there were two sittings. The trade-off is documented in PRD §5.6.
     */
    fun cards(runs: List<PodcastRun>, max: Int): List<PodcastRun> {
        val cards = mutableListOf<PodcastRun>()
        var total = 0L
        for (run in runs.sortedBy { it.startedAt }) {
            if (cards.size >= max) break
            val closedBefore = total / OCCURRENCE_MS
            total += run.listenedMs
            if (total / OCCURRENCE_MS > closedBefore) cards += run
        }
        return cards
    }


    /**
     * Whether nothing more can glue onto the sitting: the glue pause has passed since its last
     * sample. Only then is it summarised — a live one re-transcribed every step. PRD §5.16.1
     */
    fun settled(run: PodcastRun, now: Instant, gapMinutes: Long): Boolean =
        Duration.between(run.endedAt, now) > Duration.ofMinutes(gapMinutes)

    /** Whether a session extends into [next]: the same episode, and a pause within the glue threshold. */
    private fun PodcastRun.joins(next: PodcastRun, gapMinutes: Long): Boolean =
        episodeId == next.episodeId &&
            Duration.between(endedAt, next.startedAt) <= Duration.ofMinutes(gapMinutes)
}
