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
 * Разбор снимка полки на сессии и производная отметка пункта «Чтение» (PRD §5.16).
 *
 * Чистая арифметика проверена отдельно ([ReadingSessionMathTest], [ReadingDayRollupTest]) —
 * здесь ровно то, что без БД не проверить: как прирост чужого счётчика превращается в сессии,
 * откуда берутся начальный и конечный процент, и кто выигрывает спор за отметку с шорткатом.
 *
 * Тесты делят одну БД с соседями, поэтому даты свои и всё записанное убирается в [cleanup].
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

    /** Свои даты: соседние тесты сеют дни фикстурами и не должны видеть чужие сессии. */
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
        // Счётчик читалки накопительный: 1800 + ещё 600 приезжают как 2400.
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
        // Три часа спустя — по владельческому сценарию это второй заход за вечер.
        service.absorb(shelf(seconds = 3_600, percent = 0.42), today, evening.plusSeconds(3 * 3_600))

        val rows = service.sessionsOn(today)
        assertEquals(2, rows.size)
        assertEquals(listOf(1_800, 1_800), rows.map { it.readSeconds })
        // «С 35% до 42%»: начало второго захода — там, где кончился первый.
        assertEquals(0.35, rows[1].startPercent!!, 1e-9)
        assertEquals(0.42, rows[1].endPercent!!, 1e-9)
    }

    @Test
    fun `a book opened for the first time ever starts at zero, not at nothing`() {
        // Книги раньше на полке не было вовсе ⇒ читать её начали сейчас, и старт честно нулевой.
        service.absorb(shelf(seconds = 1_800, percent = 0.10), today, evening)

        val session = sessions.listByDate(today).single()
        assertEquals(0.0, session.startPercent!!, 1e-9)
        assertEquals(0.10, session.endPercent!!, 1e-9)
    }

    @Test
    fun `a book seen lying on the shelf earlier starts where we last saw it`() {
        // Главный сценарий владельца: книга весь день лежит на 35% и поллер её видит (чтения нет,
        // сессий нет), а вечером за неё садятся. «Откуда» знаем именно из этих наблюдений.
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
        // Обнови наблюдение до разбора — и старт совпал бы с финишем, дав пустую «42% → 42%».
        service.absorb(shelf(seconds = 1_800, percent = 0.42), today, evening)

        val session = sessions.listByDate(today).single()
        assertNotEquals(session.startPercent, session.endPercent)
    }

    @Test
    fun `a book we only inherited history for keeps an unknown start`() {
        // Дни чтения были ДО того, как мы начали смотреть: откуда владелец стартовал сегодня,
        // знать неоткуда — подставлять ноль значило бы приписать ему чужие проценты.
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
        // Дочитанная книга кончилась на 100%, начатая — с нуля: обе честно со своим путём.
        assertEquals(1.0, rows[0].endPercent!!, 1e-9)
        assertEquals(0.0, rows[1].startPercent!!, 1e-9)
        // Минуты складываются в общий зачёт дня: 20 + 15 закрывают одну остановку.
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

        // Те самые 12 секунд доехали вместе с остальными: зачёт считается от счётчика читалки.
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
        // Ни времени, ни процентов у прошедшего дня взяться неоткуда.
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

        // Шорткат зафиксировал ноль — производная отметка его не перебивает (решение владельца).
        assertEquals(0, markCount())
    }

    // ── фикстуры ──

    private fun book(percent: Double) = ShelfBook(
        id = 1,
        title = "Хребты безумия",
        author = "Лавкрафт",
        coverPath = "cover/hp.png",
        percent = percent,
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
