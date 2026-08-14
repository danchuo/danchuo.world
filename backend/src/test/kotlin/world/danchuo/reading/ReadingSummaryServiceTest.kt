package world.danchuo.reading

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Очередь пересказов (PRD §5.16) — та её часть, где решается, кого вообще спрашивать.
 *
 * Сама выдержка и разбор ответа проверены отдельно ([EpubTextTest], [ReadingSummaryPromptTest]);
 * здесь — правила очереди, которых в них нет:
 * - **в очередь попадает только то, что можно вырезать**: без файла книги, без обоих концов
 *   пути по процентам или с не сдвинувшимся процентом пересказывать нечего, и такой заход не
 *   должен занимать такт;
 * - **готовое не переспрашивается** — иначе фон жёг бы бесплатный лимит на одном и том же;
 * - **но дорос — переспрашивается**: заход, продлённый после пересказа, покрыт им уже не
 *   целиком, и карточка обещала бы больше, чем рассказывают пункты;
 * - **промах не вечен**: попытки считаются, и после потолка заход выпадает из очереди —
 *   до тех пор, пока не появится новая цель.
 *
 * Тесты делят одну БД с соседями, поэтому за собой прибираем в [cleanup].
 */
@QuarkusTest
class ReadingSummaryServiceTest {

    @Inject
    lateinit var service: ReadingSummaryService

    @Inject
    lateinit var sessions: ReadingSessionRepository

    @Inject
    lateinit var summaries: ReadingSummaryRepository

    private val date: LocalDate = LocalDate.of(2026, 3, 3)

    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run {
            sessions.listByDate(date).forEach { session ->
                summaries.delete("sessionId", session.id)
            }
            sessions.delete("date", date)
        }
    }

    @Test
    fun `only a sitting that can be cut out of the book gets in line`() {
        val cuttable = session(percent = 0.31 to 0.37, file = "file/книга.epub")
        session(percent = 0.40 to 0.44, file = null)
        session(percent = null, file = "file/книга.epub")
        // Процент не сдвинулся — куска нет, и пересказывать нечего («42% → 42%» не кусок).
        session(percent = 0.42 to 0.42, file = "file/книга.epub")

        val candidate = service.nextCandidate()

        assertNotNull(candidate)
        assertEquals(cuttable, candidate!!.sessionId)
        assertEquals(0.31, candidate.startPercent)
        assertEquals(0.37, candidate.endPercent)
    }

    @Test
    fun `a retold sitting is never asked about again`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")

        assertTrue(retell(id, Retelling(listOf("Что-то произошло."), "Итог.")))

        assertNull(service.nextCandidate()?.takeIf { it.sessionId == id })
        assertEquals(listOf("Что-то произошло."), service.readyFor(id)?.bulletLines())
        assertEquals(setOf(id), service.readySessions(listOf(id)))
    }

    @Test
    fun `a miss is counted and eventually gives up`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")
        val limit = 3

        repeat(limit) {
            assertEquals(id, service.nextCandidate()?.sessionId, "заход обязан оставаться в очереди")
            assertEquals(false, retell(id, null))
        }

        assertNull(service.nextCandidate()?.takeIf { it.sessionId == id })
        // Промах — это не пересказ: показывать на борде по-прежнему нечего.
        assertNull(service.readyFor(id))
    }

    @Test
    fun `a sitting that grew after the retelling comes back in line`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")
        retell(id, Retelling(listOf("Первая половина захода."), null))

        // Вернулся к книге через десять минут: поллер тянет ТОТ ЖЕ заход дальше, а пересказ
        // остаётся про его начало — карточка сказала бы «10% → 30%», а пункты про 15%.
        grow(id, to = 0.30)

        val again = service.nextCandidate()
        assertEquals(id, again?.sessionId)
        assertEquals(0.30, again?.endPercent, "пересказывать надо заход целиком, а не дописку")
    }

    @Test
    fun `a hair of extra progress does not wake the queue`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")
        retell(id, Retelling(listOf("Заход."), null))

        // Полпроцента книги — это округление и пара абзацев; звать за них модель незачем.
        grow(id, to = 0.16)

        assertNull(service.nextCandidate()?.takeIf { it.sessionId == id })
    }

    @Test
    fun `a failed refresh keeps the retelling that was already there`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")
        retell(id, Retelling(listOf("Первая половина захода."), "Итог."))
        grow(id, to = 0.30)

        assertEquals(false, retell(id, null))

        // Модель промолчала — это не повод стирать то, что уже рассказано и показано.
        assertEquals(listOf("Первая половина захода."), service.readyFor(id)?.bulletLines())
        assertEquals(setOf(id), service.readySessions(listOf(id)))
    }

    @Test
    fun `growing further gives a given-up sitting another chance`() {
        val id = session(percent = 0.10 to 0.15, file = "file/книга.epub")
        retell(id, Retelling(listOf("Заход."), null))
        grow(id, to = 0.30)
        repeat(3) { retell(id, null) }

        assertNull(service.nextCandidate()?.takeIf { it.sessionId == id }, "попытки на эту цель вышли")

        // Заход дорос ещё — это новая цель, а не та же самая: счётчик промахов начинается заново.
        grow(id, to = 0.50)

        assertEquals(id, service.nextCandidate()?.sessionId)
    }

    /** Прогнать заход через очередь так же, как это делает поллер: взять кандидата и записать. */
    private fun retell(sessionId: Long, retelling: Retelling?): Boolean {
        val candidate = service.nextCandidate()
        assertEquals(sessionId, candidate?.sessionId, "заход обязан быть в очереди")
        return service.store(candidate!!, retelling, "модель")
    }

    /** Заход дорос: поллер продлил ту же строку, а не открыл новую. */
    private fun grow(sessionId: Long, to: Double) {
        QuarkusTransaction.requiringNew().run {
            sessions.findById(sessionId)!!.endPercent = to
        }
    }

    /** Заход на полке: минуты не важны, важны файл книги и путь по процентам. */
    private fun session(percent: Pair<Double, Double>?, file: String?): Long =
        QuarkusTransaction.requiringNew().call<Long> {
            val session = ReadingSession().apply {
                this.date = this@ReadingSummaryServiceTest.date
                bookId = 777
                bookTitle = "Книга"
                bookAuthor = "Автор"
                readSeconds = 1_800
                startPercent = percent?.first
                endPercent = percent?.second
                bookFilePath = file
            }
            sessions.persist(session)
            session.id!!
        }
}
