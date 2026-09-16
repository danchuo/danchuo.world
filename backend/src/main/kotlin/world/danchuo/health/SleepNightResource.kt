package world.danchuo.health

import io.quarkus.cache.CacheResult
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.config.MskTime
import world.danchuo.core.config.TimeConfig
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Night detail: `GET /api/sleep/night/{date}`. A separate endpoint rather than a field on
 * `DayView` for two reasons — the band is fetched only when actually shown, and "a typical night"
 * is a 30-day aggregate that would otherwise recompute on every calendar refocus. PRD §5.4
 */
@Path("/api/sleep")
@Produces(MediaType.APPLICATION_JSON)
class SleepNightResource(
    private val nights: SleepNightService,
    private val mskTime: MskTime,
) {

    @GET
    @Path("/night/{date}")
    fun night(@PathParam("date") raw: String): Response {
        val date = try {
            LocalDate.parse(raw)
        } catch (_: DateTimeParseException) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(mapOf("error" to "invalid_date", "field" to "date", "value" to raw))
                .build()
        }
        if (date.isBefore(mskTime.genesis)) {
            return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "before_genesis", "date" to raw))
                .build()
        }
        return Response.ok(nights.of(date)).build()
    }
}

/**
 * Assembles the night detail from stored chunks. Cached: chunks change only on ingest.
 */
@ApplicationScoped
class SleepNightService(
    private val segments: SleepSegmentRepository,
    private val timeConfig: TimeConfig,
) {

    @CacheResult(cacheName = "sleep-night")
    fun of(date: LocalDate): SleepNightView {
        val zone = timeConfig.zoneId()
        val chunks = segments.listByWakeDate(date).map { SleepSegment(it.stage, it.startedAt, it.endedAt) }
        return SleepNightView(
            date = date,
            axisStartHour = SleepBand.AXIS_START_HOUR,
            band = SleepBand.of(SleepNight.of(chunks, date, zone), date, zone),
        )
    }
}

/**
 * The endpoint's reply: the night laid out in time. There is NO "typical night" profile here
 * (PRD §5.4) — the vertical is taken by sleep depth, and comparing against a usual window would
 * come down to a pale strip under the axis that answers nothing.
 */
@RegisterForReflection
data class SleepNightView(
    val date: LocalDate,
    /** The MSK hour the band's minutes are counted from. */
    val axisStartHour: Int,
    /** `null` means no chunks for this night (an empty day, or a day predating chunk storage). */
    val band: SleepBandView?,
)
