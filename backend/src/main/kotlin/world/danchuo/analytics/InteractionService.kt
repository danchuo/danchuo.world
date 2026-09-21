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

/** Per-tile totals straight from SQL, before the cloud is attached. */
data class TileTotal(val tileId: String?, val clicks: Int, val uniques: Int)

/** One cell of a tile's click cloud on the [HeatmapView.grid] lattice. */
data class TileBin(val tileId: String?, val x: Int, val y: Int, val clicks: Int)

/** A cell of the cloud as the tile carries it. */
data class HeatCell(val x: Int, val y: Int, val clicks: Int)

/** Per-tile heatmap aggregate: clicks are already CAPPED per visitor's contribution (anti-abuse). */
data class HeatmapTile(
    val tileId: String?,
    val clicks: Int,
    val uniques: Int,
    val cells: List<HeatCell>,
)

/** Heatmap summary for one page over a period (the owner's private view, B2). */
data class HeatmapView(
    val path: String,
    val from: String,
    val to: String,
    val grid: Int,
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
    @param:ConfigProperty(name = "danchuo.analytics.heatmap.grid") private val grid: Int,
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
     * Per-tile aggregate over a period (MSK dates `[from, to]`, inclusive by day), each tile
     * carrying the cloud of where inside it the clicks landed.
     */
    fun heatmap(path: String, from: LocalDate, to: LocalDate): HeatmapView {
        val zone: ZoneId = clock.zone
        val fromInstant = from.atStartOfDay(zone).toInstant()
        val toInstant = to.plusDays(1).atStartOfDay(zone).toInstant() // the end of day `to`, inclusive

        val cloud = repository.tileBins(path, fromInstant, toInstant, grid).groupBy { it.tileId }
        val tiles = repository.tileTotals(path, fromInstant, toInstant, visitorCap).map { total ->
            HeatmapTile(
                tileId = total.tileId,
                clicks = total.clicks,
                uniques = total.uniques,
                cells = cloud[total.tileId].orEmpty().map { HeatCell(it.x, it.y, it.clicks) },
            )
        }

        return HeatmapView(
            path = path,
            from = from.toString(),
            to = to.toString(),
            grid = grid,
            totalClicks = tiles.sumOf { it.clicks },
            tiles = tiles,
        )
    }

    /**
     * Cleans one click. A tile click carries fractions inside the tile; a click on the ground
     * carries them inside the VIEWPORT and no tileId — both are points, on different boxes.
     */
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
