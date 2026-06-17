package world.danchuo.health

import jakarta.transaction.Transactional
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.days.DayRecordService
import java.time.LocalDate

/**
 * `POST /api/ingest/health` (PRD §5.4, §12 M1) — push с iOS-шортката (авто 12/18/24 MSK).
 *
 * За токеном: защита прозрачна — [world.danchuo.core.security.IngestAuthFilter] ловит
 * префикс `api/ingest`, сам слайс про bearer не знает. Идемпотентно: статы дня
 * перезаписываются (upsert по дате), тренировки заменяются целиком — Health отдаёт
 * весь день, пропущенный прогон догоняется следующим.
 *
 * Семантика null ≠ 0 (§5.4): отсутствующая метрика остаётся `null` («нет данных»),
 * пришедший 0 — реальный ноль.
 */
@Path("/api/ingest/health")
class HealthIngestResource(
    private val dayRecordService: DayRecordService,
    private val workoutRepository: WorkoutRepository,
) {

    data class SleepStagesDto(
        val rem: Int? = null,
        val deep: Int? = null,
        val light: Int? = null,
        val awake: Int? = null,
    )

    data class WorkoutDto(
        val type: String? = null,
        val durationMinutes: Int? = null,
        val activeEnergyKcal: Int? = null,
        val distanceMeters: Int? = null,
    )

    data class HealthIngestRequest(
        val date: LocalDate? = null,
        val steps: Int? = null,
        val sleepMinutes: Int? = null,
        val sleepStages: SleepStagesDto? = null,
        val workouts: List<WorkoutDto> = emptyList(),
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    fun ingest(req: HealthIngestRequest): Response {
        val date = req.date
            ?: return badRequest("missing_field", "date")

        val workouts = req.workouts.map { dto ->
            val type = dto.type?.takeIf { it.isNotBlank() }
                ?: return badRequest("missing_field", "workouts[].type")
            Workout().apply {
                this.type = type
                durationMinutes = dto.durationMinutes ?: 0
                activeEnergyKcal = dto.activeEnergyKcal
                distanceMeters = dto.distanceMeters
            }
        }

        val stages = req.sleepStages
        dayRecordService.applyHealth(
            date = date,
            steps = req.steps,
            sleepMinutes = req.sleepMinutes,
            sleepRem = stages?.rem,
            sleepDeep = stages?.deep,
            sleepLight = stages?.light,
            sleepAwake = stages?.awake,
        )
        workoutRepository.replaceForDate(date, workouts)

        return Response.ok(
            mapOf("date" to date.toString(), "workouts" to workouts.size),
        ).build()
    }

    private fun badRequest(error: String, field: String): Response =
        Response.status(Response.Status.BAD_REQUEST)
            .type(MediaType.APPLICATION_JSON)
            .entity(mapOf("error" to error, "field" to field))
            .build()
}
