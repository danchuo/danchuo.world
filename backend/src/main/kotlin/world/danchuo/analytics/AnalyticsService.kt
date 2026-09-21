package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import world.danchuo.core.security.VisitorHash
import world.danchuo.core.security.BotHeuristics

/** One day's summary (PRD §5.11): visits, uniques, average time on page. */
data class AnalyticsDailySummary(
    val date: String,
    val visits: Int,
    val uniques: Int,
    val avgDwellMs: Int?,
)

/**
 * Analytics logic (PRD §5.11). Beacon writes are idempotent per visit: the load row is created,
 * and the `dwellMs` follow-up updates it by [AnalyticsEvent.visitId] rather than adding a dupe.
 * The summary is computed in memory (traffic is small): grouped by MSK date, bots excluded.
 */
@ApplicationScoped
class AnalyticsService(
    private val repository: AnalyticsRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
) {

    /** Records a beacon event. [dwellMs] != null with a known [visitId] updates the existing row. */
    @Transactional
    fun record(
        visitId: String?,
        path: String,
        dwellMs: Int?,
        referrer: String?,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ) {
        if (dwellMs != null && visitId != null) {
            val existing = repository.findByVisitId(visitId)
            if (existing != null) {
                existing.dwellMs = dwellMs
                return
            }
        }

        val event = AnalyticsEvent().apply {
            this.occurredAt = Instant.now(clock)
            this.path = path
            this.visitorDayHash = visitorHash.of(ip, userAgent ?: "")
            this.deviceType = bots.deviceType(userAgent)
            this.referrer = referrer
            this.dwellMs = dwellMs
            this.isBot = bots.isBot(userAgent, acceptLanguage)
            this.visitId = visitId
        }
        repository.persist(event)
    }

    /** Private per-day summary (visits/uniques/average time), bots excluded. */
    fun summary(): List<AnalyticsDailySummary> {
        val zone = clock.zone
        return repository.listAll()
            .filter { !it.isBot }
            .groupBy { it.occurredAt.atZone(zone).toLocalDate() }
            .toSortedMap()
            .map { (date: LocalDate, events) ->
                val dwells = events.mapNotNull { it.dwellMs }
                AnalyticsDailySummary(
                    date = date.toString(),
                    visits = events.size,
                    uniques = events.map { it.visitorDayHash }.distinct().size,
                    avgDwellMs = if (dwells.isEmpty()) null else dwells.average().toInt(),
                )
            }
    }
}
