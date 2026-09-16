package world.danchuo.reading

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import java.time.Instant
import java.time.LocalDate

/**
 * Splitting a shelf snapshot into sessions and deriving the "reading" mark (PRD §5.16). The pure
 * arithmetic lives in [ReadingSessionMathTest] and [ReadingDayRollupTest]; here is what needs a
 * DB. Dates are this class's own and everything written is removed in [cleanup].
 */
@QuarkusTest
class ReadingServiceTest {

    @Inject
    lateinit var service: ReadingService

    @Inject
    lateinit var sessions: ReadingSessionRepository

    @Inject
    lateinit var bookStates: ReadingBookStateRepository

    @Inject
    lateinit var checklistItems: ChecklistItemRepository

    @Inject
    lateinit var checklistEntries: ChecklistEntryRepository

    /** Our own dates: neighbours seed days from fixtures and must not see these sessions. */
    private val today: LocalDate = LocalDate.of(2026, 4, 7)
    private val yesterday: LocalDate = today.minusDays(1)
    private val evening: Instant = Instant.parse("2026-04-07T16:00:00Z")

    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run {
            sessions.delete("date in ?1", listOf(today, yesterday))
            bookStates.deleteById(1L)
            bookStates.deleteById(2L)
            checklistItems.findByKey(READING_KEY)?.let { item ->
                checklistEntries.delete("date in ?1 and itemId = ?2", listOf(today, yesterday), item.id!!)
            }
        }
    }

    @Test
    fun `an increment becomes a session carrying the book and where it stopped`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        val session = sessions.listByDate(today).single()
        assertEquals(1_800, session.readSeconds)
        assertEquals("Хребты безумия", session.bookTitle)
        assertEquals("Лавкрафт", session.bookAuthor)
        assertEquals("cover/hp.png", session.coverPath)
        assertEquals(0.42, session.endPercent!!, 1e-9)
        assertEquals(ReadingSource.LIVE.code(), session.source)
    }

    @Test
    fun `the next increment extends the same session and carries the percentage forward`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.35), today, evening)
        // The reader's counter accumulates: 1800 plus another 600 arrive as 2400.
        service.absorb(shelf(seconds = 2_400, percent = 0.42), today, evening.plusSeconds(600))

        val session = sessions.listByDate(today).single()
        assertEquals(2_400, session.readSeconds)
        assertEquals(0.42, session.endPercent!!, 1e-9)
    }

    @Test
    fun `an unchanged counter credits nothing and writes nothing`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)
        val credited = service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening.plusSeconds(300))

        assertEquals(0, credited)
        assertEquals(1, sessions.listByDate(today).size)
    }

    @Test
    fun `a second session after a long pause starts where the first one stopped`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.35), today, evening)
        // Three hours later — by the owner's usage that is a second sitting the same evening.
        service.absorb(shelf(seconds = 3_600, percent = 0.42), today, evening.plusSeconds(3 * 3_600))

        val rows = service.sessionsOn(today)
        assertEquals(2, rows.size)
        assertEquals(listOf(1_800, 1_800), rows.map { it.readSeconds })
        // "From 35% to 42%": the second sitting starts where the first ended.
        assertEquals(0.35, rows[1].startPercent!!, 1e-9)
        assertEquals(0.42, rows[1].endPercent!!, 1e-9)
    }

    @Test
    fun `a book opened for the first time ever starts at zero, not at nothing`() {
        // The book was not on the shelf before ⇒ reading started now, and the start is honestly zero.
        service.absorb(shelf(seconds = 1_800, percent = 0.10), today, evening)

        val session = sessions.listByDate(today).single()
        assertEquals(0.0, session.startPercent!!, 1e-9)
        assertEquals(0.10, session.endPercent!!, 1e-9)
    }

    @Test
    fun `a position carried over from another reader is not counted as read today`() {
        // The owner read elsewhere and moved the position by hand, so the reader sees 47% at once
        // with no past counters. Three minutes cannot be half a book: the start stays unknown
        // rather than zero, and the card shows only what was reached.
        service.absorb(shelf(seconds = 170, percent = 0.4765), today, evening)

        val session = sessions.listByDate(today).single()
        assertNull(session.startPercent)
        assertEquals(0.4765, session.endPercent!!, 1e-9)
    }

    @Test
    fun `a book seen lying on the shelf earlier starts where we last saw it`() {
        // The owner's main scenario: the book sits at 35% all day with the poller seeing it and
        // no reading, then the evening happens. "Where from" comes from those observations.
        service.absorb(
            ShelfSnapshot(books = mapOf(1L to book(percent = 0.35)), dayTotals = emptyList()),
            today,
            evening.minusSeconds(3_600),
        )

        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        val session = sessions.listByDate(today).single()
        assertEquals(0.35, session.startPercent!!, 1e-9)
        assertEquals(0.42, session.endPercent!!, 1e-9)
    }

    @Test
    fun `the observation is taken before the increment, not after`() {
        // Update the observation before splitting and the start would equal the finish, giving
        // an empty "42% → 42%".
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        val session = sessions.listByDate(today).single()
        assertNotEquals(session.startPercent, session.endPercent)
    }

    @Test
    fun `a book we only inherited history for keeps an unknown start`() {
        // Reading days happened BEFORE we started watching: there is no way to know today's
        // start, and substituting zero would credit the owner with someone else's percent.
        service.absorb(
            ShelfSnapshot(
                books = mapOf(1L to book(percent = 0.42)),
                dayTotals = listOf(
                    ShelfDayTotal(bookId = 1, date = yesterday, seconds = 2_400),
                    ShelfDayTotal(bookId = 1, date = today, seconds = 1_800),
                ),
            ),
            today,
            evening,
        )

        assertNull(sessions.listByDate(today).single().startPercent)
    }

    @Test
    fun `finishing one book and starting another the same day gives two separate sessions`() {
        val finished = ShelfBook(id = 1, title = "Хребты безумия", author = "Лавкрафт", coverPath = null, percent = 1.0)
        val started = ShelfBook(id = 2, title = "Дюна", author = "Херберт", coverPath = null, percent = 0.08)

        service.absorb(
            ShelfSnapshot(
                books = mapOf(1L to finished, 2L to started),
                dayTotals = listOf(
                    ShelfDayTotal(bookId = 1, date = today, seconds = 1_200),
                    ShelfDayTotal(bookId = 2, date = today, seconds = 900),
                ),
            ),
            today,
            evening,
        )

        val rows = service.sessionsOn(today).sortedBy { it.bookId }
        assertEquals(2, rows.size)
        assertEquals(listOf("Хребты безумия", "Дюна"), rows.map { it.bookTitle })
        // A finished book ends at 100%, a started one begins at zero: each with its own path.
        assertEquals(1.0, rows[0].endPercent!!, 1e-9)
        assertEquals(0.0, rows[1].startPercent!!, 1e-9)
        // Minutes add into the day's shared tally: 20 + 15 close one stop.
        assertEquals(1, markCount())
    }

    @Test
    fun `flipping through a book to try it does not create a session`() {
        val credited = service.absorb(shelf(seconds = 12, percent = 0.01), today, evening)

        assertEquals(0, credited)
        assertEquals(0, sessions.listByDate(today).size)
    }

    @Test
    fun `seconds held back as noise are not lost - they arrive with the next real reading`() {
        service.absorb(shelf(seconds = 12, percent = 0.01), today, evening)
        service.absorb(shelf(seconds = 1_800, percent = 0.10), today, evening.plusSeconds(300))

        // Those 12 seconds arrive with the rest: the tally follows the reader's counter.
        assertEquals(1_800, sessions.listByDate(today).single().readSeconds)
    }

    @Test
    fun `a day that was already over arrives as one imported row without invented history`() {
        service.absorb(
            ShelfSnapshot(
                books = mapOf(1L to book(percent = 0.42)),
                dayTotals = listOf(ShelfDayTotal(bookId = 1, date = yesterday, seconds = 2_400)),
            ),
            today,
            evening,
        )

        val session = sessions.listByDate(yesterday).single()
        assertEquals(2_400, session.readSeconds)
        assertEquals(ReadingSource.IMPORTED.code(), session.source)
        // A past day has neither times nor percentages to take.
        assertNull(session.startPercent)
        assertNull(session.startedAt)
    }

    @Test
    fun `a late sync tops up a past day instead of duplicating it`() {
        val past = { seconds: Int ->
            ShelfSnapshot(
                books = mapOf(1L to book(percent = 0.42)),
                dayTotals = listOf(ShelfDayTotal(bookId = 1, date = yesterday, seconds = seconds)),
            )
        }
        service.absorb(past(2_400), today, evening)
        service.absorb(past(3_000), today, evening.plusSeconds(300))

        val session = sessions.listByDate(yesterday).single()
        assertEquals(3_000, session.readSeconds)
    }

    @Test
    fun `half an hour of reading closes one stop of the item`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        assertEquals(1, markCount())
    }

    @Test
    fun `two half-hour sessions close both stops`() {
        service.absorb(shelf(seconds = 1_800, percent = 0.35), today, evening)
        service.absorb(shelf(seconds = 3_600, percent = 0.42), today, evening.plusSeconds(3 * 3_600))

        assertEquals(2, markCount())
    }

    @Test
    fun `a hand entered mark wins and the poller stops touching that day`() {
        val item = checklistItems.findByKey(READING_KEY)!!
        QuarkusTransaction.requiringNew().run { checklistEntries.upsert(today, item, 0) }

        service.absorb(shelf(seconds = 3_600, percent = 0.42), today, evening)

        // The shortcut recorded a zero — the derived mark does not override it.
        assertEquals(0, markCount())
    }

    @Test
    fun `the book file is filled in even for sittings that gained no minutes`() {
        // The sitting was recorded BEFORE we started taking the book file off the shelf.
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)
        QuarkusTransaction.requiringNew().run {
            sessions.listByDate(today).forEach { it.bookFilePath = null }
        }

        // Same snapshot, no new minutes, nothing to refresh — and still the file path must land,
        // or all past history would stay without a retelling forever.
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        assertEquals("file/hp.epub", sessions.listByDate(today).single().bookFilePath)
    }

    // ── fixtures ──

    private fun book(percent: Double) = ShelfBook(
        id = 1,
        title = "Хребты безумия",
        author = "Лавкрафт",
        coverPath = "cover/hp.png",
        percent = percent,
        filePath = "file/hp.epub",
    )

    private fun shelf(seconds: Int, percent: Double) = ShelfSnapshot(
        books = mapOf(1L to book(percent)),
        dayTotals = listOf(ShelfDayTotal(bookId = 1, date = today, seconds = seconds)),
    )

    private fun markCount(): Int {
        val item = checklistItems.findByKey(READING_KEY)!!
        return checklistEntries.listByDate(today).firstOrNull { it.itemId == item.id }?.count ?: 0
    }

    private companion object {
        const val READING_KEY = "reading"
    }
}
