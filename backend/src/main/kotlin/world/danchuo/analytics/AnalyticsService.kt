package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.net.URI
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import world.danchuo.core.security.VisitorHash
import world.danchuo.core.security.BotHeuristics

/** One day of the period: the shape the dashboard's chart is drawn from. */
data class DailyPoint(
    val date: String,
    val visits: Int,
    val uniques: Int,
    val avgDwellMs: Int?,
    val engagedVisits: Int,
)

/** One row of a breakdown; `key` is null for the bucket the dimension was absent in. */
data class BreakdownRow(
    val key: String?,
    val visits: Int,
    val uniques: Int,
    val engagedVisits: Int,
)

/** Period aggregate straight from SQL, before clicks and the engagement share are folded in. */
data class Totals(
    val visits: Int,
    val uniques: Int,
    val avgDwellMs: Int?,
    val engagedVisits: Int,
    val avgScrollPct: Int?,
)

/** The KPI row of the dashboard. */
data class SummaryTotals(
    val visits: Int,
    val uniques: Int,
    val avgDwellMs: Int?,
    val engagedVisits: Int,
    val engagementPct: Int,
    val avgScrollPct: Int?,
    val clicks: Int,
)

/** What the owner's dashboard reads: totals, the daily series and every dimension. PRD §5.11 */
data class AnalyticsSummary(
    val from: String,
    val to: String,
    val totals: SummaryTotals,
    val days: List<DailyPoint>,
    val breakdowns: Map<String, List<BreakdownRow>>,
)

/**
 * Analytics logic (PRD §5.11). Writes are one row per visit — the beacon's follow-ups merge by
 * `visitId` in Postgres. Reads are SQL aggregates: the summary must not depend on how many raw
 * rows the period holds.
 */
@ApplicationScoped
class AnalyticsService(
    private val repository: AnalyticsRepository,
    private val interactions: InteractionRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
    @param:ConfigProperty(name = "danchuo.analytics.engaged-ms") private val engagedMs: Int,
    @param:ConfigProperty(name = "danchuo.analytics.breakdown-limit") private val breakdownLimit: Int,
) {

    /** Records a beacon: the load ping creates the visit, every follow-up merges into it. */
    @Transactional
    fun record(
        visitId: String?,
        path: String,
        dwellMs: Int?,
        scrollPct: Int?,
        referrer: String?,
        utmSource: String?,
        utmMedium: String?,
        utmCampaign: String?,
        waveKey: String?,
        viewportW: Int?,
        viewportH: Int?,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ) {
        val event = AnalyticsEvent().apply {
            this.occurredAt = Instant.now(clock)
            this.path = path
            this.visitorDayHash = visitorHash.of(ip, userAgent ?: "")
            this.deviceType = bots.deviceType(userAgent)
            this.referrer = referrer
            this.referrerHost = hostOf(referrer)
            this.utmSource = utmSource
            this.utmMedium = utmMedium
            this.utmCampaign = utmCampaign
            this.waveKey = waveKey
            this.viewportW = viewportW?.takeIf { it in 1..MAX_VIEWPORT }
            this.viewportH = viewportH?.takeIf { it in 1..MAX_VIEWPORT }
            this.scrollPct = scrollPct?.coerceIn(0, 100)
            this.dwellMs = dwellMs?.takeIf { it >= 0 }
            this.isBot = bots.isBot(userAgent, acceptLanguage)
            this.visitId = visitId
        }
        repository.upsert(event)
    }

    /** The owner's private dashboard over `[from, to]` in MSK days, inclusive. */
    fun summary(from: LocalDate, to: LocalDate): AnalyticsSummary {
        val zone = clock.zone
        val fromInstant = from.atStartOfDay(zone).toInstant()
        val toInstant = to.plusDays(1).atStartOfDay(zone).toInstant()

        val totals = repository.totals(fromInstant, toInstant, engagedMs)
        val dimensions = Dimension.entries.associate { dimension ->
            dimension.jsonKey to repository.breakdown(dimension, fromInstant, toInstant, engagedMs, breakdownLimit)
        }

        return AnalyticsSummary(
            from = from.toString(),
            to = to.toString(),
            totals = SummaryTotals(
                visits = totals.visits,
                uniques = totals.uniques,
                avgDwellMs = totals.avgDwellMs,
                engagedVisits = totals.engagedVisits,
                engagementPct = if (totals.visits == 0) 0 else totals.engagedVisits * 100 / totals.visits,
                avgScrollPct = totals.avgScrollPct,
                clicks = interactions.countInRange(fromInstant, toInstant),
            ),
            days = repository.daily(zone.id, fromInstant, toInstant, engagedMs),
            breakdowns = dimensions,
        )
    }

    /** Host of a referrer URL, `www.` dropped; junk and same-site blanks fall back to null. */
    private fun hostOf(referrer: String?): String? = referrer
        ?.let { runCatching { URI(it).host }.getOrNull() }
        ?.removePrefix("www.")
        ?.takeIf { it.isNotBlank() && it.length <= AnalyticsLimits.REFERRER_HOST }

    private companion object {
        const val MAX_VIEWPORT = 100_000
    }
}

/** The name this dimension travels under in the summary JSON. */
private val Dimension.jsonKey: String
    get() = when (this) {
        Dimension.SOURCE -> "source"
        Dimension.DEVICE -> "device"
        Dimension.UTM_SOURCE -> "utmSource"
        Dimension.UTM_MEDIUM -> "utmMedium"
        Dimension.UTM_CAMPAIGN -> "utmCampaign"
        Dimension.WAVE -> "wave"
        Dimension.VIEWPORT -> "viewport"
    }
