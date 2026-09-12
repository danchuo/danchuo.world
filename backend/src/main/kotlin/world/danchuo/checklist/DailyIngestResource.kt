package world.danchuo.checklist

import jakarta.transaction.Transactional
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.core.config.MskTime
import java.time.LocalDate

/**
 * `POST /api/ingest/daily` (PRD §5.6, §12 M1) — интерактивный iOS-шорткат в один тап:
 * имя дня + прогресс дисциплины + монстр. За токеном (фильтр ловит `api/ingest`).
 *
 * Идемпотентно (upsert по дате/паре date+item): правка задним числом повторным POST
 * не плодит дубли. Дата ограничена окном ручного ввода [сегодня − N, сегодня] по MSK
 * (`danchuo.checklist.ingest-window-days`): будущее и глубокое прошлое ⇒ 400 — защита
 * от опечатки в дате на телефоне. Логика — в [DailyIngestService].
 */
@Path("/api/ingest/daily")
class DailyIngestResource(
    private val dailyIngestService: DailyIngestService,
    private val mskTime: MskTime,
    @param:ConfigProperty(name = "danchuo.checklist.ingest-window-days") private val windowDays: Long,
) {

    data class DailyIngestRequest(
        val date: LocalDate? = null,
        val title: String? = null,
        /** Прогресс пунктов: `{itemKey: count}`. Пункт `monster` ведётся своим полем. */
        val items: Map<String, Int> = emptyMap(),
        /**
         * Монстр: любое непустое значение = «пил», `null`/пусто/нет = «не пил».
         *
         * Имя поля — **проводное, а не смысловое**: шорткат на телефоне шлёт сюда название
         * вкуса, и переименование поля сломало бы его на ровном месте. Само значение больше
         * ни на что не влияет — вкусы сняты (§5.6).
         */
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

        val today = mskTime.today()
        if (date.isAfter(today) || date.isBefore(today.minusDays(windowDays))) {
            return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "date_out_of_window", "windowDays" to windowDays))
                .build()
        }

        dailyIngestService.ingest(
            date = date,
            title = req.title,
            items = req.items,
            monster = req.monsterFlavorKey,
        )

        return Response.ok(mapOf("date" to date.toString())).build()
    }
}
