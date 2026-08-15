package world.danchuo.summary

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Служба пересказов (PRD §5.16) — та её часть, которую без базы не проверить.
 *
 * Сами правила очереди — арифметика и живут отдельно ([SummaryPolicyTest]); здесь про то, как
 * они ложатся в строки:
 * - **очередь спрашивает источник**, а отсеивает уже сама — источник не обязан помнить, о чём
 *   рассказано;
 * - **готовое переживает неудачное освежение** — промах не стирает того, что уже на карточке;
 * - **вид источника — часть ключа**: заход №7 у книг и заход №7 у подкастов это разные строки,
 *   и перепутать их значило бы рассказывать под карточкой чужое.
 *
 * Источник здесь поддельный и намеренно: служба не должна знать ни про полку, ни про epub — весь
 * её интерес к источнику умещается в [SummarySource]. Тесты делят одну БД с соседями, поэтому
 * заходы взяты с заведомо своими id и убираются в [cleanup].
 */
@QuarkusTest
class SummaryServiceTest {

    @Inject
    lateinit var service: SummaryService

    @Inject
    lateinit var summaries: ContentSummaryRepository

    private val session = 900_001L
    private val source = FakeSource(SummaryKind.READING)

    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run { summaries.delete("sessionId >= ?1", 900_000L) }
    }

    @Test
    fun `a sitting nobody has been asked about is next in line`() {
        source.offer(session, from = 0.31, to = 0.37)

        val target = service.nextTarget(source)

        assertNotNull(target)
        assertEquals(session, target!!.sessionId)
        assertEquals(0.31, target.from)
        assertEquals(0.37, target.to)
    }

    @Test
    fun `the queue takes the sittings in the order the source gave them`() {
        source.offer(900_002L, from = 0.10, to = 0.20)
        source.offer(session, from = 0.10, to = 0.20)

        assertEquals(900_002L, service.nextTarget(source)?.sessionId)
    }

    @Test
    fun `a retold sitting is never asked about again`() {
        source.offer(session, from = 0.10, to = 0.15)

        assertTrue(retell(Retelling(listOf("Что-то произошло."), "Итог.")))

        assertNull(service.nextTarget(source))
        assertEquals(listOf("Что-то произошло."), service.readyFor(SummaryKind.READING, session)?.bulletLines())
        assertEquals(setOf(session), service.readySessions(SummaryKind.READING, listOf(session)))
    }

    @Test
    fun `a miss is counted and eventually gives up`() {
        source.offer(session, from = 0.10, to = 0.15)

        repeat(3) {
            assertNotNull(service.nextTarget(source), "заход обязан оставаться в очереди")
            assertEquals(false, retell(null))
        }

        assertNull(service.nextTarget(source))
        // Промах — это не пересказ: показывать на борде по-прежнему нечего.
        assertNull(service.readyFor(SummaryKind.READING, session))
    }

    @Test
    fun `a sitting that grew after the retelling comes back in line`() {
        source.offer(session, from = 0.10, to = 0.15)
        retell(Retelling(listOf("Первая половина захода."), null))

        // Вернулся к книге через десять минут: поллер тянет ТОТ ЖЕ заход дальше, а пересказ
        // остаётся про его начало — карточка сказала бы «10% → 30%», а пункты про 15%.
        source.offer(session, from = 0.10, to = 0.30)

        val again = service.nextTarget(source)
        assertEquals(session, again?.sessionId)
        assertEquals(0.30, again?.to, "пересказывать надо заход целиком, а не дописку")
    }

    @Test
    fun `a failed refresh keeps the retelling that was already there`() {
        source.offer(session, from = 0.10, to = 0.15)
        retell(Retelling(listOf("Первая половина захода."), "Итог."))
        source.offer(session, from = 0.10, to = 0.30)

        assertEquals(false, retell(null))

        // Модель промолчала — это не повод стирать то, что уже рассказано и показано.
        assertEquals(
            listOf("Первая половина захода."),
            service.readyFor(SummaryKind.READING, session)?.bulletLines(),
        )
        assertEquals(setOf(session), service.readySessions(SummaryKind.READING, listOf(session)))
    }

    @Test
    fun `the same session id in another kind is another sitting entirely`() {
        val podcasts = FakeSource(SummaryKind.PODCAST).also { it.offer(session, from = 0.10, to = 0.15) }
        source.offer(session, from = 0.10, to = 0.15)

        retell(Retelling(listOf("Про книгу."), null))

        // Книга рассказана, выпуск с тем же номером захода — нет.
        assertNull(service.nextTarget(source))
        assertEquals(session, service.nextTarget(podcasts)?.sessionId)
        assertNull(service.readyFor(SummaryKind.PODCAST, session))
        assertEquals(
            listOf("Про книгу."),
            service.readyFor(SummaryKind.READING, session)?.bulletLines(),
        )
    }

    /** Прогнать заход через очередь так же, как это делает поллер: взять цель и записать итог. */
    private fun retell(retelling: Retelling?): Boolean {
        val target = service.nextTarget(source)
        assertNotNull(target, "заход обязан быть в очереди")
        return service.store(target!!, retelling, "модель")
    }

    /**
     * Источник, который просто помнит, что ему положили. Служба спрашивает у него ровно две
     * вещи — что можно резать и что там написано, — и обе здесь заданы прямо.
     */
    private class FakeSource(private val kind: SummaryKind) : SummarySource {

        private val targets = LinkedHashMap<Long, SummaryTarget>()

        /** Положить (или подвинуть) заход: повторный вызов с тем же id — это «заход дорос». */
        fun offer(sessionId: Long, from: Double, to: Double) {
            targets[sessionId] = SummaryTarget(
                kind = kind,
                sessionId = sessionId,
                title = "Источник",
                byline = "Подпись",
                from = from,
                to = to,
            )
        }

        override fun kind(): SummaryKind = kind

        override fun isConfigured(): Boolean = true

        override fun candidates(): List<SummaryTarget> = targets.values.toList()

        override fun excerpt(target: SummaryTarget): SummaryExcerpt? = SummaryExcerpt("текст куска")
    }
}
