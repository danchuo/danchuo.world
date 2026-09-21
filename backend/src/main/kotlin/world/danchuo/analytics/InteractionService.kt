package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import world.danchuo.core.security.VisitorHash
import world.danchuo.core.security.BotHeuristics

/** One click from a beacon batch (B2). Every field is dirty — validated on write. */
data class ClickInput(
    val tileId: String? = null,
    val offsetXPct: Double? = null,
    val offsetYPct: Double? = null,
    val viewportW: Int? = null,
)

/** Per-tile heatmap aggregate: clicks are already CAPPED per visitor's contribution (anti-abuse). */
data class HeatmapTile(
    val tileId: String?,
    val clicks: Int,
    val uniques: Int,
)

/** Heatmap summary for one page over a period (the owner's private view, B2). */
data class HeatmapView(
    val path: String,
    val from: String,
    val to: String,
    val totalClicks: Int,
    val tiles: List<HeatmapTile>,
)

/**
 * Heatmap logic, symmetric to [AnalyticsService] but about clicks on tiles. The public POST is
 * defended in echelons — rate limit, validation on write, and a read-side cap of [visitorCap]
 * clicks per visitor per tile, so one spammed visit cannot repaint the picture. PRD §5.11, §11
 */
@ApplicationScoped
class InteractionService(
    private val repository: InteractionRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
    @param:ConfigProperty(name = "danchuo.analytics.heatmap.max-batch") private val maxBatch: Int,
    @param:ConfigProperty(name = "danchuo.analytics.heatmap.visitor-cap") private val visitorCap: Int,
) {

    /** Writes a click batch. Junk (broken coordinates, over-long tileId) is dropped per item. */
    @Transactional
    fun record(
        visitId: String?,
        path: String,
        clicks: List<ClickInput>,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ) {
        if (clicks.isEmpty()) return
        val hash = visitorHash.of(ip, userAgent ?: "")
        val isBot = bots.isBot(userAgent, acceptLanguage)
        val now = Instant.now(clock)

        clicks.asSequence()
            .take(maxBatch) // a batch ceiling against abuse: a long array is trimmed, not rejected
            .mapNotNull { sanitize(it) }
            .forEach { clean ->
                val event = InteractionEvent().apply {
                    this.occurredAt = now
                    this.path = path
                    this.tileId = clean.tileId
                    this.offsetXPct = clean.offsetXPct
                    this.offsetYPct = clean.offsetYPct
                    this.viewportW = clean.viewportW
                    this.visitorDayHash = hash
                    this.isBot = isBot
                    this.visitId = visitId
                }
                repository.persist(event)
            }
    }

    /**
     * Per-tile aggregate over a period (MSK dates `[from, to]`, inclusive by day). Each visitor's
     * clicks into a tile are capped at [visitorCap], so one visit's spam cannot skew the map.
     */
    fun heatmap(path: String, from: LocalDate, to: LocalDate): HeatmapView {
        val zone: ZoneId = clock.zone
        val fromInstant = from.atStartOfDay(zone).toInstant()
        val toInstant = to.plusDays(1).atStartOfDay(zone).toInstant() // the end of day `to`, inclusive

        val events = repository.listForHeatmap(path, fromInstant, toInstant)
        val tiles = events
            .groupBy { it.tileId }
            .map { (tileId, group) ->
                val cappedClicks = group
                    .groupingBy { it.visitorDayHash }
                    .eachCount()
                    .values
                    .sumOf { minOf(it, visitorCap) }
                HeatmapTile(
                    tileId = tileId,
                    clicks = cappedClicks,
                    uniques = group.map { it.visitorDayHash }.distinct().size,
                )
            }
            .sortedByDescending { it.clicks }

        return HeatmapView(
            path = path,
            from = from.toString(),
            to = to.toString(),
            totalClicks = tiles.sumOf { it.clicks },
            tiles = tiles,
        )
    }

    /** Cleans one click: `tileId` up to 64 chars, coordinates strictly in [0,1]. null means drop. */
    private fun sanitize(input: ClickInput): ClickInput? {
        val tileId = input.tileId?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_TILE_ID }
        val x = input.offsetXPct?.takeIf { it in 0.0..1.0 }
        val y = input.offsetYPct?.takeIf { it in 0.0..1.0 }
        val viewport = input.viewportW?.takeIf { it in 1..MAX_VIEWPORT }
        if (tileId == null && x == null && y == null) return null
        return ClickInput(tileId = tileId, offsetXPct = x, offsetYPct = y, viewportW = viewport)
    }

    private companion object {
        const val MAX_TILE_ID = 64
        const val MAX_VIEWPORT = 100_000
    }
}
