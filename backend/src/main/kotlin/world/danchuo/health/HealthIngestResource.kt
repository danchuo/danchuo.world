package world.danchuo.health

import jakarta.transaction.Transactional
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.checklist.JournalMarker
import world.danchuo.core.config.TimeConfig
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
 * пришедший 0 — реальный ноль. Единственное исключение — сон: ночь в 0 минут «сна не было»,
 * нормализуется в `null` (см. [SleepNormalization]).
 *
 * Сон принимается в двух формах. Основная — сырые куски `sleepSegments`: шорткат ничего не
 * считает, ночь собирает [SleepSessionizer] (день = день пробуждения, §4). Легаси-форма
 * (готовые `sleepMinutes` + `sleepStages`) принимается как раньше — на ней ночь, начавшаяся
 * до полуночи, обрезалась фильтром шортката.
 */
@Path("/api/ingest/health")
class HealthIngestResource(
    private val dayRecordService: DayRecordService,
    private val workoutRepository: WorkoutRepository,
    private val journalMarker: JournalMarker,
    private val timeConfig: TimeConfig,
    private val journalConfig: JournalConfig,
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

    /** Сырой кусок сна: имя фазы и границы строками (`2026-07-27T23:20:00+03:00`). */
    data class SleepSegmentDto(
        val stage: String? = null,
        val start: String? = null,
        val end: String? = null,
    )

    /** Сырой кусок «осознанности» (время в приложении «Журнал»): только границы, фазы нет. */
    data class MindfulSegmentDto(
        val start: String? = null,
        val end: String? = null,
    )

    data class HealthIngestRequest(
        val date: LocalDate? = null,
        val steps: Int? = null,
        val sleepMinutes: Int? = null,
        val sleepStages: SleepStagesDto? = null,
        val sleepSegments: List<SleepSegmentDto>? = null,
        val mindfulSegments: List<MindfulSegmentDto>? = null,
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

        val segments = req.sleepSegments
        val sleep = if (segments != null) {
            // Куски пришли — считаем ночь сами: только так вечернее начало (уснул до полуночи)
            // попадает в день пробуждения независимо от того, каким окном их выбрал шорткат.
            val zone = timeConfig.zoneId()
            val parsed = ArrayList<SleepSegment>(segments.size)
            segments.forEachIndexed { i, dto ->
                // Незнакомая фаза (в т.ч. `In Bed` — это не сон) молча пропускается: имена фаз
                // задаёт Apple, новое имя не должно ронять весь приём. Битая дата — наоборот,
                // это поломка шортката, и о ней надо узнать сразу.
                val stage = SleepStage.of(dto.stage) ?: return@forEachIndexed
                val start = SleepSessionizer.parseInstant(dto.start, zone)
                    ?: return badRequest("bad_field", "sleepSegments[$i].start")
                val end = SleepSessionizer.parseInstant(dto.end, zone)
                    ?: return badRequest("bad_field", "sleepSegments[$i].end")
                parsed += SleepSegment(stage, start, end)
            }
            SleepSessionizer.summarize(parsed, date, zone)
        } else {
            val stages = req.sleepStages
            // Ночь в 0 минут — не реальный ноль, а «сна не было» (шорткат шлёт 0 при пустом
            // HealthKit): схлопываем длительность и фазы в null, чтобы плитки не показывали
            // «0м» с пустыми фазами.
            SleepNormalization.normalize(
                SleepInput(
                    minutes = req.sleepMinutes,
                    rem = stages?.rem,
                    deep = stages?.deep,
                    light = stages?.light,
                    awake = stages?.awake,
                ),
            )
        }
        // Куски пришли, но ночи из них не собралось — это почти всегда пустой прогон (телефон был
        // заблокирован, окно поиска промахнулось), а не «не спал»: отличить по данным нельзя,
        // поэтому сон не трогаем. Стереть ночь по-прежнему можно явным `sleepMinutes = 0`.
        val blankRun = segments != null && sleep.minutes == null

        // «Осознанность» = время в приложении «Журнал». День выбирает бэк, как и у сна, но
        // по другому правилу: не по пробуждению, а по вечерней корзине (§5.6). Поэтому один
        // широкий прогон может закрыть и вчерашний день — дата запроса тут не ограничитель.
        val mindful = req.mindfulSegments
        val journalMinutes = if (mindful == null) {
            emptyMap()
        } else {
            val zone = timeConfig.zoneId()
            val parsed = ArrayList<MindfulSegment>(mindful.size)
            mindful.forEachIndexed { i, dto ->
                val start = SleepSessionizer.parseInstant(dto.start, zone)
                    ?: return badRequest("bad_field", "mindfulSegments[$i].start")
                val end = SleepSessionizer.parseInstant(dto.end, zone)
                    ?: return badRequest("bad_field", "mindfulSegments[$i].end")
                parsed += MindfulSegment(start, end)
            }
            JournalDetector.minutesByDay(parsed, journalConfig.windowStart(), journalConfig.windowEnd(), zone)
        }

        dayRecordService.applyHealth(
            date = date,
            steps = req.steps,
            sleepMinutes = sleep.minutes,
            sleepRem = sleep.rem,
            sleepDeep = sleep.deep,
            sleepLight = sleep.light,
            sleepAwake = sleep.awake,
            overwriteSleep = !blankRun,
        )
        workoutRepository.replaceForDate(date, workouts)

        // Отметка идёт только «сделано» и только в пустоту: ручная галочка перекрывает минуты.
        // Кэш проекции дня уже сброшен applyHealth выше — стрики дисциплины пересчитаются.
        val journalDays = journalMinutes
            .filterValues { it >= journalConfig.minMinutes() }
            .keys.sorted()
            .filter { journalMarker.markDone(it) }

        // Ответ читается глазами в `Show Result` на телефоне — пусть сразу видно, что записалось:
        // ночь в минутах, признак «прогон пустой, сон не тронут» (иначе пустота неотличима от
        // нуля) и минуты дневника по дням — с ними видно и «не добрал порог», и «решено вручную».
        return Response.ok(
            mapOf(
                "date" to date.toString(),
                "workouts" to workouts.size,
                "sleepMinutes" to sleep.minutes,
                "sleepSkipped" to blankRun,
                "journalMinutes" to journalMinutes.mapKeys { (day, _) -> day.toString() },
                "journalDays" to journalDays.map { it.toString() },
            ),
        ).build()
    }

    private fun badRequest(error: String, field: String): Response =
        Response.status(Response.Status.BAD_REQUEST)
            .type(MediaType.APPLICATION_JSON)
            .entity(mapOf("error" to error, "field" to field))
            .build()
}
