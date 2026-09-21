package world.danchuo.analytics

import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import world.danchuo.core.config.MskTime
import java.time.LocalDate

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

    /** Dashboard over a period; `from`/`to` are MSK dates and default to the last 7 days. */
    @GET
    @Path("/summary")
    fun summary(
        @QueryParam("from") from: String?,
        @QueryParam("to") to: String?,
    ): AnalyticsSummary {
        val window = window(from, to)
        return service.summary(window.first, window.second)
    }

    /**
     * Heatmap for a page over a period. `path` stays a parameter although the UI does not expose
     * it — the public board is one page, and a wider window is a database question. PRD §5.11
     */
    @GET
    @Path("/heatmap")
    fun heatmap(
        @QueryParam("path") @DefaultValue("/") path: String,
        @QueryParam("from") from: String?,
        @QueryParam("to") to: String?,
    ): HeatmapView {
        val window = window(from, to)
        return interactions.heatmap(path, window.first, window.second)
    }

    /** Shared period parsing: both views answer for the same window or they cannot be read together. */
    private fun window(from: String?, to: String?): Pair<LocalDate, LocalDate> {
        val today = mskTime.today()
        val toDate = to?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) } ?: today
        val fromDate = from?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) } ?: today.minusDays(6)
        return fromDate to toDate
    }
}
