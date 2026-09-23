package world.danchuo.days

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.config.MskTime
import world.danchuo.film.PhotoVariant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/**
 * Public day reads, the "Today + calendar" axis: `/api/days/{date}` is the full [DayView],
 * `/api/days?from=&to=` a range of [DaySummary]. Dates are ISO in the MSK canon, parsed by hand so
 * failures come back as JSON in the ingest style; before genesis there is no data. PRD §5.4, §4
 */
@Path("/api/days")
@Produces(MediaType.APPLICATION_JSON)
class DaysResource(
    private val aggregator: DayAggregator,
    private val mskTime: MskTime,
    private val dayPhotos: DayPhotoService,
) {

    @GET
    @Path("/{date}")
    fun day(@PathParam("date") raw: String): Response {
        val date = parseDate(raw) ?: return badDate("date", raw)
        // Before genesis there is no day on the data axis (§4) — that is a 404, not an empty day.
        if (date.isBefore(mskTime.genesis)) {
            return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "before_genesis", "date" to raw))
                .build()
        }
        // MSK today enters the projection (the streak's "through yesterday" rule) and the cache key.
        return Response.ok(aggregator.viewOf(date, mskTime.today())).build()
    }

    /** The day's photo; the view's URL carries `?v=`, so a stored variant is cached for good. */
    @GET
    @Path("/{date}/photo/{variant}")
    @Produces("image/jpeg")
    fun photo(@PathParam("date") raw: String, @PathParam("variant") rawVariant: String): Response {
        val date = parseDate(raw) ?: return Response.status(Response.Status.NOT_FOUND).build()
        val variant = PhotoVariant.entries.firstOrNull { it.name.equals(rawVariant, ignoreCase = true) }
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val bytes = dayPhotos.read(date, variant) ?: return Response.status(Response.Status.NOT_FOUND).build()
        val cache = CacheControl().apply {
            maxAge = 60 * 60 * 24 * 30
            isPrivate = false
        }
        return Response.ok(bytes, "image/jpeg").cacheControl(cache).build()
    }

    @GET
    fun range(
        @QueryParam("from") rawFrom: String?,
        @QueryParam("to") rawTo: String?,
    ): Response {
        if (rawFrom == null) return missing("from")
        if (rawTo == null) return missing("to")
        val from = parseDate(rawFrom) ?: return badDate("from", rawFrom)
        val to = parseDate(rawTo) ?: return badDate("to", rawTo)

        if (to.isBefore(from)) {
            return badRequest("invalid_range", mapOf("from" to rawFrom, "to" to rawTo))
        }
        if (ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) {
            return badRequest("range_too_large", mapOf("maxDays" to MAX_RANGE_DAYS))
        }

        // Clamp to genesis: nothing exists before it, and this makes no holes in the grid (§4).
        val start = maxOf(from, mskTime.genesis)
        val summaries = if (start.isAfter(to)) emptyList() else aggregator.summaries(start, to)
        return Response.ok(summaries).build()
    }

    private fun parseDate(raw: String): LocalDate? =
        try {
            LocalDate.parse(raw)
        } catch (_: DateTimeParseException) {
            null
        }

    private fun badDate(field: String, value: String): Response =
        badRequest("invalid_date", mapOf("field" to field, "value" to value))

    private fun missing(field: String): Response =
        badRequest("missing_field", mapOf("field" to field))

    private fun badRequest(error: String, extra: Map<String, Any?>): Response =
        Response.status(Response.Status.BAD_REQUEST)
            .entity(mapOf("error" to error) + extra)
            .build()

    private companion object {
        /** Guards the public GET against an unbounded range (a year with room to spare). */
        const val MAX_RANGE_DAYS = 366L
    }
}
