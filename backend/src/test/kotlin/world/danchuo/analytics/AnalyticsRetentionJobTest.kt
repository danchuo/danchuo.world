package world.danchuo.analytics

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Test
import world.danchuo.core.security.DeviceType
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Retention (PRD §5.11): raw telemetry is not kept forever. Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
class AnalyticsRetentionJobTest {

    @Inject
    lateinit var job: AnalyticsRetentionJob

    @Inject
    lateinit var events: AnalyticsRepository

    @Inject
    lateinit var clicks: InteractionRepository

    private fun hash() = "retention-" + UUID.randomUUID()

    @Test
    fun `the purge drops raw rows past the horizon and leaves today alone`() {
        val staleHash = hash()
        val freshHash = hash()
        val ancient = Instant.now().minus(3650, ChronoUnit.DAYS)

        QuarkusTransaction.requiringNew().run {
            events.persist(visitAt(ancient, staleHash))
            events.persist(visitAt(Instant.now(), freshHash))
            clicks.persist(clickAt(ancient, staleHash))
            clicks.persist(clickAt(Instant.now(), freshHash))
        }

        QuarkusTransaction.requiringNew().run { job.purge() }

        assert(events.count("visitorDayHash", staleHash) == 0L) { "a ten-year-old visit must go" }
        assert(events.count("visitorDayHash", freshHash) == 1L) { "today's visit must stay" }
        assert(clicks.count("visitorDayHash", staleHash) == 0L) { "its clicks go with it" }
        assert(clicks.count("visitorDayHash", freshHash) == 1L) { "today's clicks stay" }
    }

    private fun visitAt(at: Instant, hash: String) = AnalyticsEvent().apply {
        occurredAt = at
        path = "/retention"
        visitorDayHash = hash
        deviceType = DeviceType.DESKTOP
        isBot = false
        visitId = UUID.randomUUID().toString()
    }

    private fun clickAt(at: Instant, hash: String) = InteractionEvent().apply {
        occurredAt = at
        path = "/retention"
        tileId = "today"
        visitorDayHash = hash
        isBot = false
    }
}
