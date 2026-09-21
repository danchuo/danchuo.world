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
 * `POST /api/ingest/health` — push from the iOS shortcut (12/18/24 MSK), idempotent: day stats
 * upsert by date and sleep chunks are replaced wholesale, as Health hands over the entire day.
 * Null is not 0, with one exception — a 0-minute night normalises to `null`. PRD §5.4
 */
@Path("/api/ingest/health")
class HealthIngestResource(
    private val dayRecordService: DayRecordService,
    private val sleepSegmentRepository: SleepSegmentRepository,
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

    /** A raw sleep chunk: phase name and bounds as strings (`2026-07-27T23:20:00+03:00`). */
    data class SleepSegmentDto(
        val stage: String? = null,
        val start: String? = null,
        val end: String? = null,
    )

    /** A raw mindfulness chunk ("Journal" app time): bounds only, it carries no phase. */
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
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    fun ingest(req: HealthIngestRequest): Response {
        val date = req.date
            ?: return badRequest("missing_field", "date")

        val zone = timeConfig.zoneId()
        val segments = req.sleepSegments
        val parsed: List<SleepSegment>? = if (segments != null) {
            val out = ArrayList<SleepSegment>(segments.size)
            segments.forEachIndexed { i, dto ->
                // An unknown phase (including `In Bed`, which is not sleep) is skipped silently:
                // Apple owns the phase names and a new one must not fail the whole ingest. A
                // broken date is the opposite — that is a broken shortcut, and we want to know.
                val stage = SleepStage.of(dto.stage) ?: return@forEachIndexed
                val start = SleepSessionizer.parseInstant(dto.start, zone)
                    ?: return badRequest("bad_field", "sleepSegments[$i].start")
                val end = SleepSessionizer.parseInstant(dto.end, zone)
                    ?: return badRequest("bad_field", "sleepSegments[$i].end")
                out += SleepSegment(stage, start, end)
            }
            out
        } else {
            null
        }

        val sleep = if (parsed != null) {
            // With chunks in hand we compute the night ourselves: only then does an evening start
            // (asleep before midnight) land on the waking day, whatever window the shortcut used.
            SleepSessionizer.summarize(parsed, date, zone)
        } else {
            val stages = req.sleepStages
            // A 0-minute night is not a real zero but "there was no sleep" (the shortcut sends 0
            // on an empty HealthKit): collapse duration and phases to null so the tiles do not
            // show "0m" with empty phases.
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
        // Chunks arrived but formed no night: that is almost always an empty run (a locked phone,
        // a missed search window), not "did not sleep", and the data cannot tell them apart — so
        // sleep is left alone. Erasing a night still takes an explicit `sleepMinutes = 0`.
        val blankRun = parsed != null && sleep.minutes == null

        // Mindfulness is "Journal" app time. The backend picks the day as it does for sleep, but
        // by another rule: not by waking, by the evening basket (§5.6). So one wide run may also
        // close yesterday — the request date is no limit here.
        val mindful = req.mindfulSegments
        val journalMinutes = if (mindful == null) {
            emptyMap()
        } else {
            val parsedMindful = ArrayList<MindfulSegment>(mindful.size)
            mindful.forEachIndexed { i, dto ->
                val start = SleepSessionizer.parseInstant(dto.start, zone)
                    ?: return badRequest("bad_field", "mindfulSegments[$i].start")
                val end = SleepSessionizer.parseInstant(dto.end, zone)
                    ?: return badRequest("bad_field", "mindfulSegments[$i].end")
                parsedMindful += MindfulSegment(start, end)
            }
            JournalDetector.minutesByDay(parsedMindful, journalConfig.windowStart(), journalConfig.windowEnd(), zone)
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
        // The night's raw chunks (I-23) are stored as they came, so the night band can be shown
        // later and asked new questions. Same rights as the sum: an empty run leaves the night
        // alone, and the only channel that erases it is an explicit `sleepMinutes = 0`.
        if (parsed != null) {
            if (!blankRun) {
                // This day's session chunks as they are — overlaps are resolved on read.
                val nightChunks = SleepSessionizer.sessionsEndingOn(parsed, date, zone).flatten()
                sleepSegmentRepository.replaceForWakeDate(date, nightChunks)
            }
        } else if (req.sleepMinutes == 0) {
            sleepSegmentRepository.replaceForWakeDate(date, emptyList())
        }

        // Minutes are a measurement, the mark is a decision, and they are written independently:
        // minutes go in for every day with segments (below the threshold too — that is how the
        // board answers "why it did not count"), the mark only into an empty slot. PRD §5.6
        journalMinutes.forEach { (day, minutes) -> dayRecordService.applyJournalMinutes(day, minutes) }
        val journalDays = journalMinutes
            .filterValues { it >= journalConfig.minMinutes() }
            .keys.sorted()
            .filter { journalMarker.markDone(it) }

        // The reply is read by eye in `Show Result` on the phone, so it names what was written:
        // the night in minutes, the "empty run, sleep untouched" flag (otherwise emptiness is
        // indistinguishable from zero), and journal minutes per day.
        return Response.ok(
            mapOf(
                "date" to date.toString(),
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
