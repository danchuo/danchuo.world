package world.danchuo.analytics

import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import world.danchuo.core.config.MskTime

/**
 * The owner's private analytics views. They live under `api/ingest`, so `IngestAuthFilter`
 * demands the bearer automatically — statistics are private in v1. PRD §5.11
 */
@Path("/api/ingest/analytics")
@Produces(MediaType.APPLICATION_JSON)
class AnalyticsSummaryResource(
    private val service: AnalyticsService,
    private val interactions: InteractionService,
    private val mskTime: MskTime,
) {

    @GET
    @Path("/summary")
    fun summary(): List<AnalyticsDailySummary> = service.summary()

    /**
     * Heatmap for a page over a period (MSK dates, inclusive). `from`/`to` default to the last
     * 7 days and `path` to `/`; the parameters stay in the API for forward compatibility even
     * though the UI does not expose them. PRD §5.11
     */
    @GET
    @Path("/heatmap")
    fun heatmap(
        @QueryParam("path") @DefaultValue("/") path: String,
        @QueryParam("from") from: String?,
        @QueryParam("to") to: String?,
    ): HeatmapView {
        val today = mskTime.today()
        val toDate = to?.takeIf { it.isNotBlank() }?.let { java.time.LocalDate.parse(it) } ?: today
        val fromDate = from?.takeIf { it.isNotBlank() }?.let { java.time.LocalDate.parse(it) } ?: today.minusDays(6)
        return interactions.heatmap(path, fromDate, toDate)
    }
}
