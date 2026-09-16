package world.danchuo.reading

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

/** Where the row came from: observed live, or taken in as an already-closed day. */
enum class ReadingSource {
    /** The poller watched the counter grow: there are clock times and a path through percentages. */
    LIVE,

    /**
     * The day arrived already past (a first run, or a late phone sync). The minutes are known and
     * nothing else is: inventing percentages for it would mean inventing a history.
     */
    IMPORTED,
    ;

    fun code(): String = name.lowercase()
}

/**
 * One continuous sitting with one book, so a book picked up morning and evening gives TWO rows
 * for one date. The minutes are the reader's, the session boundaries and percentages are ours.
 * Book metadata is denormalised on purpose: a book can leave the shelf, the history stays. §5.16
 */
@Entity
@Table(name = "reading_session")
class ReadingSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** The MSK date the reading belongs to; a session never crosses midnight. */
    @Column(nullable = false)
    lateinit var date: LocalDate

    /** The book's id inside the reader DB — it lives exactly as long as the shelf does. */
    @Column(name = "book_id", nullable = false)
    var bookId: Long = 0

    @Column(name = "book_title", nullable = false, length = 512)
    lateinit var bookTitle: String

    @Column(name = "book_author", length = 256)
    var bookAuthor: String? = null

    /** Cover path inside the shelf ("cover/name.png"); served out through [ReadingResource]. */
    @Column(name = "cover_path", length = 512)
    var coverPath: String? = null

    /**
     * The book file's path inside the shelf, the source of the text for summarising a stretch
     * ([ReadingSummarySource]). Denormalised for the same reason as the title and cover: the book
     * may be taken off the shelf, and what was told about a past session must remain.
     */
    @Column(name = "book_file_path", length = 512)
    var bookFilePath: String? = null

    /** Credited seconds — increments of the reader's counter, not a difference of clock times. */
    @Column(name = "read_seconds", nullable = false)
    var readSeconds: Int = 0

    /** A 0..1 fraction, as the reader stores it. `null` when the start is unknown (first or import). */
    @Column(name = "start_percent")
    var startPercent: Double? = null

    @Column(name = "end_percent")
    var endPercent: Double? = null

    /** The time of our observations; empty on imported days, when we were not watching. */
    @Column(name = "started_at")
    var startedAt: Instant? = null

    @Column(name = "ended_at")
    var endedAt: Instant? = null

    @Column(nullable = false, length = 16)
    var source: String = ReadingSource.LIVE.code()
}

/**
 * Access to reading sessions. Reads go by date and by range (day cards and the calendar); writes
 * come only from [ReadingService].
 */
@ApplicationScoped
class ReadingSessionRepository : PanacheRepository<ReadingSession> {

    fun listByDate(date: LocalDate): List<ReadingSession> = list("date", date)

    /** Sessions over the inclusive range `[from, to]`, for the calendar's batch read. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<ReadingSession> =
        list("date >= ?1 and date <= ?2", from, to)

    /** One book's rows for a date — the already-credited total (the poller's state). */
    fun listByBookAndDate(bookId: Long, date: LocalDate): List<ReadingSession> =
        list("bookId = ?1 and date = ?2", bookId, date)

    /**
     * The book's latest session for a date, the candidate to continue. Whether to extend it or
     * open a new one is decided by [ReadingSessionMath.continues] from the pause.
     */
    fun latestOn(bookId: Long, date: LocalDate): ReadingSession? =
        find("bookId = ?1 and date = ?2 order by endedAt desc nulls last, id desc", bookId, date).firstResult()

    /**
     * Sessions a stretch of book CAN be cut from: the shelf file is known and both ends of the
     * percentage path exist (PRD §5.16). Newest first — the board is read from today, and last
     * night matters before last March.
     */
    fun summarisable(): List<ReadingSession> = list(
        "bookFilePath is not null and startPercent is not null and endPercent is not null " +
            "and endPercent > startPercent order by date desc, id desc",
    )

    /**
     * Fills in a book's file path wherever it is still missing. Sitting metadata refreshes only
     * when minutes grow, and the path was collected later than the sittings themselves, so old
     * history would stay empty forever. ONLY empties are filled; a stored path is never touched.
     */
    fun fillMissingFilePath(bookId: Long, filePath: String): Int =
        update("bookFilePath = ?1 where bookId = ?2 and bookFilePath is null", filePath, bookId)

    /**
     * The book's last known percentage — the "from" of a new session. Taken at any date:
     * yesterday's stop at 35% is exactly where today's reading begins.
     */
    fun lastKnownPercent(bookId: Long): Double? =
        find("bookId = ?1 and endPercent is not null order by date desc, endedAt desc nulls last, id desc", bookId)
            .firstResult()
            ?.endPercent
}
