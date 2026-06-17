package world.danchuo.checklist

import jakarta.transaction.Transactional
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import java.time.LocalDate

/**
 * `POST /api/ingest/daily` (PRD §5.6, §12 M1) — интерактивный iOS-шорткат в один тап:
 * имя дня + прогресс дисциплины + вкус монстра. За токеном (фильтр ловит `api/ingest`).
 *
 * Идемпотентно (upsert по дате/паре date+item): правка задним числом повторным POST
 * не плодит дубли. Логика — в [DailyIngestService].
 */
@Path("/api/ingest/daily")
class DailyIngestResource(
    private val dailyIngestService: DailyIngestService,
) {

    data class DailyIngestRequest(
        val date: LocalDate? = null,
        val title: String? = null,
        /** Прогресс пунктов: `{itemKey: count}`. Пункт `monster` ведётся вкусом. */
        val items: Map<String, Int> = emptyMap(),
        /** Ключ вкуса монстра; `null`/нет = «не пил». */
        val monsterFlavorKey: String? = null,
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    fun ingest(req: DailyIngestRequest): Response {
        val date = req.date
            ?: return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "missing_field", "field" to "date"))
                .build()

        dailyIngestService.ingest(
            date = date,
            title = req.title,
            items = req.items,
            monsterFlavorKey = req.monsterFlavorKey,
        )

        return Response.ok(mapOf("date" to date.toString())).build()
    }
}
