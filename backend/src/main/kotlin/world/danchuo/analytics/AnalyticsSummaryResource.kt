package world.danchuo.analytics

import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import world.danchuo.core.config.MskTime

/**
 * Приватная вьюха аналитики владельца (PRD §5.11) — `GET /api/ingest/analytics/…`.
 * Живёт под `api/ingest`, поэтому `IngestAuthFilter` требует bearer **автоматически** (тот же
 * шов «креды записи», что у мутаций): статистика приватна в v1, публичного счётчика нет.
 *
 * - `/summary` — по дням: заходы, уники (по суточному хэшу), среднее время на странице;
 * - `/heatmap` — потайловый агрегат кликов (B2): сколько раз кликнули в каждую плитку борда.
 *   Боты исключены в обоих; в хитмапе вклад одного посетителя в тайл ограничен (анти-абуз).
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
     * Хитмапа по странице за период (даты MSK, включительно). `from`/`to` опциональны:
     * по умолчанию — **последние 7 дней** до сегодня (за бóльшим окном — прямой запрос к БД);
     * `path` по умолчанию — главная (`/`). Сами параметры в API остаются (forward-compat).
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
        val fromDate = from?.takeIf { it.isNotBlank() }?.let { java.time.LocalDate.parse(it) } ?: today.minusDays(7)
        return interactions.heatmap(path, fromDate, toDate)
    }
}
