package world.danchuo.analytics

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.time.Clock
import java.time.temporal.ChronoUnit

/**
 * Raw telemetry has a horizon. Nothing rolls the days up first: a second source of truth for the
 * same numbers costs more than a year-old visit of a personal site is worth. PRD §5.11
 */
@ApplicationScoped
class AnalyticsRetentionJob(
    private val events: AnalyticsRepository,
    private val clicks: InteractionRepository,
    private val clock: Clock,
    @param:ConfigProperty(name = "danchuo.analytics.retention-days") private val retentionDays: Long,
) {

    private val log: Logger = Logger.getLogger(AnalyticsRetentionJob::class.java)

    @Scheduled(
        every = "{danchuo.analytics.retention.interval}",
        delayed = "5m",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    @Transactional
    fun purge() {
        val cutoff = clock.instant().minus(retentionDays, ChronoUnit.DAYS)
        val visits = events.deleteOlderThan(cutoff)
        val taps = clicks.deleteOlderThan(cutoff)
        if (visits > 0 || taps > 0) {
            log.infof("analytics retention: purged %d visits and %d clicks before %s", visits, taps, cutoff)
        }
    }
}
