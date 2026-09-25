package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.checklist.ReadingMarker
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

/**
 * Writing and reading of what was read: poller state and the day rollup. A separate bean from
 * [ReadingPoller] out of necessity — `@Transactional` is a CDI interceptor and does not fire on a
 * call into the same bean, so the poller's write has to leave for a neighbour.
 */
@ApplicationScoped
class ReadingService(
    private val sessions: ReadingSessionRepository,
    private val bookStates: ReadingBookStateRepository,
    private val marker: ReadingMarker,
    private val config: ReadingConfig,
) {

    /**
     * Absorbs a shelf snapshot, returning credited seconds; zero means nothing changed and the
     * poller need not drop the day projection. It walks EVERY day in the snapshot, since a late
     * sync brings yesterday's minutes today; credit is a difference, so a repeat pass is free.
     */
    @Transactional
    fun absorb(snapshot: ShelfSnapshot, today: LocalDate, at: Instant): Int {
        var credited = 0
        val touched = LinkedHashSet<LocalDate>()
        // What we saw on the PREVIOUS tick, taken before parsing: that is the "from" of the
        // session about to open. Take the percentages after, and the start would equal the finish.
        val seenBefore = bookStates.percentsByBook()

        // Date order is not cosmetic: past days must be imported BEFORE today's session opens, or
        // it would not see that the book already had a history.
        for (total in snapshot.dayTotals.sortedWith(compareBy({ it.date }, { it.bookId }))) {
            val book = snapshot.books[total.bookId] ?: continue
            val gained = absorb(book, total, snapshot, seenBefore, today, at)
            if (gained > 0) {
                credited += gained
                touched += total.date
            }
        }

        // The observation is updated at the end and for EVERY shelf book, not just the ones read:
        // the point of the row is precisely the untouched book, whose percentage will be needed
        // when someone finally sits down with it.
        snapshot.books.values.forEach { book ->
            bookStates.observe(book.id, book.percent, at)
            // The file path is backfilled onto every session of this book that lacks one: metadata
            // refreshes only alongside a minutes increment, and we began fetching the file later
            // than the sessions — otherwise all past history would stay unsummarisable (§5.16).
            book.filePath?.let { sessions.fillMissingFilePath(book.id, it) }
        }

        touched.forEach(::remark)
        return credited
    }

    /** A day's sessions in chronological order — the day's cards. */
    fun sessionsOn(date: LocalDate): List<ReadingSession> =
        sessions.listByDate(date).sortedWith(compareBy({ it.startedAt ?: Instant.EPOCH }, { it.id }))

    /** Total minutes read in a day — the discipline item's caption. */
    fun minutesOn(date: LocalDate): Int = ReadingDayRollup.minutes(secondsOn(date))

    // -- writing --

    /**
     * Pulls in one book's counter increment for one day. A day already past lands as an imported
     * row (it can have neither times nor percentages), while today lands as a live session:
     * either continuing an open one or starting a new one.
     */
    private fun absorb(
        book: ShelfBook,
        total: ShelfDayTotal,
        snapshot: ShelfSnapshot,
        seenBefore: Map<Long, Double>,
        today: LocalDate,
        at: Instant,
    ): Int {
        val existing = sessions.listByBookAndDate(book.id, total.date)
        val credit = ReadingSessionMath.credit(total.seconds, existing.sumOf { it.readSeconds })
        if (credit == 0) return 0

        if (total.date.isBefore(today)) {
            importPast(book, total.date, credit, existing)
        } else if (!live(book, total, snapshot, seenBefore, credit, at)) {
            // Opened a book for a glance: no session is started, and the seconds stay uncredited
            // until the next increment (crediting counts off the reader's counter, not off ticks).
            return 0
        }
        return credit
    }

    /**
     * A past day: the minutes are known, nothing else is. One imported row per book-day, which
     * grows on a late sync rather than spawning neighbours: we have nothing to tell about
     * yesterday's sittings anyway, and extra rows would take up cards for nothing.
     */
    private fun importPast(book: ShelfBook, date: LocalDate, credit: Int, existing: List<ReadingSession>) {
        val imported = existing.firstOrNull { it.source == ReadingSource.IMPORTED.code() }
        if (imported != null) {
            imported.readSeconds += credit
            imported.describe(book)
            return
        }
        sessions.persist(
            newSession(book, date, credit).apply { source = ReadingSource.IMPORTED.code() },
        )
    }

    /**
     * Today: extend the open session while the pause is within the gap, otherwise start a new one
     * from the last known percentage — yesterday's stop at 35% is today's "from". Unknown leaves
     * it EMPTY rather than the current value: "from 42% to 42%" would read as "read nothing".
     */
    private fun live(
        book: ShelfBook,
        total: ShelfDayTotal,
        snapshot: ShelfSnapshot,
        seenBefore: Map<Long, Double>,
        credit: Int,
        at: Instant,
    ): Boolean {
        val gap = Duration.ofMinutes(config.sessionGapMinutes())
        val latest = sessions.latestOn(book.id, total.date)

        if (latest != null &&
            latest.source == ReadingSource.LIVE.code() &&
            ReadingSessionMath.continues(latest.endedAt, at, gap)
        ) {
            latest.readSeconds += credit
            latest.endedAt = at
            book.percent?.let { latest.endPercent = it }
            latest.describe(book)
            return true
        }

        // The threshold gates only OPENING a session: the tail minutes of an open one still count.
        if (credit < config.minSessionSeconds()) return false

        sessions.persist(
            newSession(book, total.date, credit).apply {
                // The "from" is sought by decreasing precision: where we ourselves stopped last
                // time, then what the shelf showed before this session, then zero for a new book.
                startPercent = sessions.lastKnownPercent(book.id)
                    ?: seenBefore[book.id]
                    ?: fromScratch(book, total, snapshot)
                endPercent = book.percent
                startedAt = at
                endedAt = at
            },
        )
        return true
    }

    /**
     * The "from" for a book we know nothing about. Zero only if it truly started now — no earlier
     * reading day on the shelf AND the percentage is plausible for today's minutes. A position
     * carried in from another reader leaves no past day and must not become "0% to 47%". §5.16
     */
    private fun fromScratch(book: ShelfBook, total: ShelfDayTotal, snapshot: ShelfSnapshot): Double? {
        if (snapshot.dayTotals.any { it.bookId == book.id && it.date.isBefore(total.date) }) return null
        val percent = book.percent ?: return 0.0
        return if (total.seconds >= percent * 100 * MIN_SECONDS_PER_PERCENT) 0.0 else null
    }

    /** Recomputes the item's mark from the minutes total; a manual [ReadingMarker] is left alone. */
    private fun remark(date: LocalDate) {
        marker.mark(date, ReadingDayRollup.occurrences(secondsOn(date)))
    }

    /** The day's credited total across all books — the item's marks are computed from it. */
    private fun secondsOn(date: LocalDate): Int = sessions.listByDate(date).sumOf { it.readSeconds }

    private fun newSession(book: ShelfBook, date: LocalDate, credit: Int) =
        // IDENTITY generation writes the row immediately, so every not-null field is set BEFORE persist.
        ReadingSession().apply {
            this.date = date
            bookId = book.id
            readSeconds = credit
            describe(book)
        }

    /** Refreshes a row's metadata: rename a book or change its cover and the board will show it. */
    private fun ReadingSession.describe(book: ShelfBook) {
        bookTitle = book.title
        bookAuthor = book.author
        coverPath = book.coverPath
        // The file path is never overwritten with emptiness: a book taken off the shelf must not
        // rob a past session of the summary that can still be built from it.
        book.filePath?.let { bookFilePath = it }
    }

    private companion object {
        /**
         * Plausibility threshold for starting at zero: seconds of reading per percent of a book.
         * Taken with huge slack — 18 s/percent is a whole book in half an hour. It does not
         * measure the owner's speed; it separates reading from an imported position. PRD §5.16
         */
        const val MIN_SECONDS_PER_PERCENT = 18
    }
}
