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
 * The retelling service (PRD §5.16) — the part that needs a database. The queue rules themselves
 * are arithmetic and live in [SummaryPolicyTest]; here is how they land in rows, with the source
 * faked on purpose: the service knows nothing but [SummarySource].
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
        // A miss is not a retelling: there is still nothing to show on the board.
        assertNull(service.readyFor(SummaryKind.READING, session))
    }

    @Test
    fun `a sitting that grew after the retelling comes back in line`() {
        source.offer(session, from = 0.10, to = 0.15)
        retell(Retelling(listOf("Первая половина захода."), null))

        // Back to the book ten minutes later: the poller extends the SAME sitting while the
        // retelling still covers its start, so the card would say "10% → 30%" over 15% of bullets.
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

        // The model stayed silent, which is no reason to erase what is told and already shown.
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

        // The book is told; the episode with the same sitting number is not.
        assertNull(service.nextTarget(source))
        assertEquals(session, service.nextTarget(podcasts)?.sessionId)
        assertNull(service.readyFor(SummaryKind.PODCAST, session))
        assertEquals(
            listOf("Про книгу."),
            service.readyFor(SummaryKind.READING, session)?.bulletLines(),
        )
    }

    /** Run a sitting through the queue as the poller does: take the target, record the result. */
    private fun retell(retelling: Retelling?): Boolean {
        val target = service.nextTarget(source)
        assertNotNull(target, "заход обязан быть в очереди")
        return service.store(target!!, retelling, "модель")
    }

    /**
     * A source that just remembers what was put in it. The service asks it exactly two things —
     * what may be cut and what it says — and both are set here directly.
     */
    private class FakeSource(private val kind: SummaryKind) : SummarySource {

        private val targets = LinkedHashMap<Long, SummaryTarget>()

        /** Put (or move) a sitting: calling again with the same id means "the sitting grew". */
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
