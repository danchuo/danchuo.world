package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.checklist.PodcastMarker
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

/**
 * One player sample: the episode and the playhead position at poll time. Everything needed to
 * extend or open a session; the metadata rides along because it is written into the session row.
 */
data class EpisodeSample(
    val episodeId: String,
    val progressMs: Long,
    val episodeName: String,
    val episodeUrl: String?,
    val showId: String?,
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    val episodeDurationMs: Long?,
)

/**
 * Writing and reading of listened podcasts: poller state and the day rollup. A separate bean from
 * [PodcastPoller] out of necessity — `@Transactional` is a CDI interceptor and does not fire on a
 * call into the same bean, so the poller's write has to leave for a neighbour.
 */
@ApplicationScoped
class PodcastListenService(
    private val sessions: PodcastSessionRepository,
    private val marker: PodcastMarker,
    private val config: SpotifyConfig,
) {

    /**
     * Records a player sample for [date], continuing the open session or starting a new one, and
     * returns credited milliseconds — zero means nothing changed. A session continues only if the
     * episode matches AND the silence stayed under the gap, so "there and back" is two rows.
     */
    @Transactional
    fun record(sample: EpisodeSample, date: LocalDate, at: Instant): Long {
        val latest = sessions.latestOn(date)
        val credited = if (latest.continues(sample, at)) {
            PodcastListenMath.tickCredit(latest!!.lastProgressMs, latest.endedAt, sample.progressMs, at)
                .also {
                    latest.listenedMs += it
                    latest.lastProgressMs = sample.progressMs
                    latest.endedAt = at
                }
        } else {
            PodcastListenMath.openingCredit(sample.progressMs).also { open(sample, date, at, it) }
        }

        remark(date)
        return credited
    }

    /**
     * A day's sessions, glued by the `run-gap-minutes` pause (see [PodcastRun]). The storage
     * threshold breaks a session sooner than a person considers listening interrupted, so the
     * board gets them reassembled into sittings rather than as they are stored.
     */
    fun runsOn(date: LocalDate): List<PodcastRun> =
        PodcastDayRollup.runs(
            sessions.listByDate(date).map(::runOf),
            config.podcast().runGapMinutes(),
        )

    /** Total minutes listened in a day — the discipline item's caption. */
    fun minutesOn(date: LocalDate): Int = PodcastDayRollup.listenedMinutes(totalMsOn(date))

    /** A day's cards: the first [max] sittings that closed stops (see [PodcastDayRollup.cards]). */
    fun cardsOn(date: LocalDate, max: Int): List<PodcastRun> =
        PodcastDayRollup.cards(runsOn(date), max)

    /** Recomputes the item's mark from the minutes total; a manual [PodcastMarker] is left alone. */
    private fun remark(date: LocalDate) {
        val target = marker.target() ?: return
        marker.mark(date, PodcastDayRollup.occurrences(totalMsOn(date), target))
    }

    /**
     * The day's credited total, computed off raw sessions without gluing them into sittings: the
     * marks depend only on minutes, and gluing does not change those, so it need not run on every poll.
     */
    private fun totalMsOn(date: LocalDate): Long = sessions.listByDate(date).sumOf { it.listenedMs }

    /** A session row as a single sitting — [PodcastDayRollup.runs] glues neighbours afterwards. */
    private fun runOf(session: PodcastSession) = PodcastRun(
        sessionId = session.id!!,
        episodeId = session.episodeId,
        listenedMs = session.listenedMs,
        startedAt = session.startedAt,
        endedAt = session.endedAt,
        episodeName = session.episodeName,
        episodeUrl = session.episodeUrl,
        showName = session.showName,
        showUrl = session.showUrl,
        imageUrl = session.imageUrl,
        episodeDurationMs = session.episodeDurationMs,
        startProgressMs = session.startProgressMs,
        lastProgressMs = session.lastProgressMs,
    )

    private fun open(sample: EpisodeSample, date: LocalDate, at: Instant, credited: Long) {
        // IDENTITY generation writes the row immediately, so every not-null field is set BEFORE persist.
        val session = PodcastSession().apply {
            this.date = date
            episodeId = sample.episodeId
            episodeName = sample.episodeName
            episodeUrl = sample.episodeUrl
            showId = sample.showId
            showName = sample.showName
            showUrl = sample.showUrl
            imageUrl = sample.imageUrl
            episodeDurationMs = sample.episodeDurationMs
            startedAt = at
            endedAt = at
            listenedMs = credited
            lastProgressMs = sample.progressMs
            // The episode stretch starts where the crediting started: from the beginning means
            // [PodcastListenMath.openingCredit] returned the whole allowance and the stretch
            // starts at zero; resumed mid-way means no allowance, and it starts where we are.
            startProgressMs = sample.progressMs - credited
        }
        sessions.persist(session)
    }

    /** Whether this session extends into [sample]: the same episode, and silence within the threshold. */
    private fun PodcastSession?.continues(sample: EpisodeSample, at: Instant): Boolean {
        if (this == null || episodeId != sample.episodeId) return false
        val silence = Duration.between(endedAt, at)
        // A negative pause is a skewed clock; starting a new session beats computing the delta.
        return !silence.isNegative && silence <= Duration.ofMinutes(config.podcast().sessionGapMinutes())
    }
}
