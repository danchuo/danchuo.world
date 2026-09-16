package world.danchuo.spotify

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * One continuous stretch of listening to one episode, so an episode taken there and back is TWO
 * rows for one date; rolling up by episode happens on read. [lastProgressMs] is the poller's own
 * state and lives here, not in memory, so a restart mid-episode loses no count. PRD §5.6
 */
@Entity
@Table(name = "podcast_session")
class PodcastSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** The MSK date the listening belongs to; a session never crosses midnight. */
    @Column(nullable = false)
    lateinit var date: LocalDate

    @Column(name = "episode_id", nullable = false, length = 64)
    lateinit var episodeId: String

    @Column(name = "episode_name", nullable = false, length = 512)
    lateinit var episodeName: String

    @Column(name = "episode_url", length = 512)
    var episodeUrl: String? = null

    @Column(name = "show_id", length = 64)
    var showId: String? = null

    /** The show name, which doubles as the card's author: the player returns no publisher. */
    @Column(name = "show_name", nullable = false, length = 256)
    lateinit var showName: String

    @Column(name = "show_url", length = 512)
    var showUrl: String? = null

    @Column(name = "image_url", length = 512)
    var imageUrl: String? = null

    @Column(name = "episode_duration_ms")
    var episodeDurationMs: Long? = null

    @Column(name = "started_at", nullable = false)
    lateinit var startedAt: Instant

    @Column(name = "ended_at", nullable = false)
    lateinit var endedAt: Instant

    /** Credited time, not a difference of clocks: pauses and rewinds never land here. */
    @Column(name = "listened_ms", nullable = false)
    var listenedMs: Long = 0

    /** The playhead position at the last poll — the base for the next delta. */
    @Column(name = "last_progress_ms", nullable = false)
    var lastProgressMs: Long = 0

    /**
     * Playhead position where this session's credit began. Together with [lastProgressMs] it is
     * the SLICE OF THE EPISODE that was heard, not merely its length — `last - listened` would
     * nearly match but a rewind moves it. `null` means nothing to cut, hence no summary. §5.16.2
     */
    @Column(name = "start_progress_ms")
    var startProgressMs: Long? = null
}

/**
 * Access to podcast sessions. Reads go page by page per date (day cards and the minutes total);
 * writes come only from [PodcastPoller].
 */
@ApplicationScoped
class PodcastSessionRepository : PanacheRepository<PodcastSession> {

    fun listByDate(date: LocalDate): List<PodcastSession> = list("date", date)

    /** Sessions over the inclusive range `[from, to]`, for the calendar's batch read. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<PodcastSession> =
        list("date >= ?1 and date <= ?2", from, to)

    /**
     * The latest session for a date, the candidate to continue. The poller extends it only when
     * the episode matches AND the poll gap stayed within the threshold — otherwise this is
     * already a different listening.
     */
    fun latestOn(date: LocalDate): PodcastSession? =
        find("date = ?1 order by endedAt desc", date).firstResult()

    /**
     * Dates holding sittings whose window start is known, newest first. The summary queue walks
     * these rather than every date: rows written before the column existed have no start and never
     * will, so regluing them each tick buys nothing. PRD §5.16.1
     */
    fun datesWithWindow(today: LocalDate, days: Long): List<LocalDate> =
        getEntityManager()
            .createQuery(
                "select distinct s.date from PodcastSession s " +
                    "where s.startProgressMs is not null and s.date >= :from order by s.date desc",
                LocalDate::class.java,
            )
            .setParameter("from", today.minusDays(days))
            .resultList
}
