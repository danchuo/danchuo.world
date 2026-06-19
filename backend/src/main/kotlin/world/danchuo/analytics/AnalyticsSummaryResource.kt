package world.danchuo.analytics

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Приватная вьюха аналитики владельца (PRD §5.11) — `GET /api/ingest/analytics/summary`.
 * Живёт под `api/ingest`, поэтому `IngestAuthFilter` требует bearer **автоматически** (тот же
 * шов «креды записи», что у мутаций): статистика приватна в v1, публичного счётчика нет.
 *
 * Отдаёт по дням: заходы, уники (по суточному хэшу), среднее время на странице; боты исключены.
 */
@Path("/api/ingest/analytics")
@Produces(MediaType.APPLICATION_JSON)
class AnalyticsSummaryResource(
    private val service: AnalyticsService,
) {

    @GET
    @Path("/summary")
    fun summary(): List<AnalyticsDailySummary> = service.summary()
}
