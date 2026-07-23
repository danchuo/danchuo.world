package world.danchuo.days

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.config.MskTime
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/**
 * Публичное чтение дней (PRD §5.4/§5.6, §12 M2) — ось «Сегодня + календарь».
 *
 * - `GET /api/days/{date}` — полная проекция дня ([DayView]) для плитки «Сегодня»/перефокуса.
 * - `GET /api/days?from=&to=` — сводки диапазона ([DaySummary]) для календаря и мини-графика.
 *
 * Всё публично на чтение (§3): фильтр `IngestAuthFilter` стережёт только `/api/ingest/…`.
 * Даты — ISO (`YYYY-MM-DD`) в каноне MSK; парсим вручную, чтобы отдавать JSON-ошибки в
 * стиле ingest-эндпоинтов. Генезис-гард (§4): раньше генезиса данных нет.
 */
@Path("/api/days")
@Produces(MediaType.APPLICATION_JSON)
class DaysResource(
    private val aggregator: DayAggregator,
    private val mskTime: MskTime,
) {

    @GET
    @Path("/{date}")
    fun day(@PathParam("date") raw: String): Response {
        val date = parseDate(raw) ?: return badDate("date", raw)
        // Раньше генезиса дня на оси данных нет (§4) — это не пустой день, а 404.
        if (date.isBefore(mskTime.genesis)) {
            return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "before_genesis", "date" to raw))
                .build()
        }
        // today MSK входит в проекцию (правило стрика «по вчера») и в ключ кэша — см. viewOf.
        return Response.ok(aggregator.viewOf(date, mskTime.today())).build()
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

        // Клампим к генезису: до него данных нет, дыр в сетке это не создаёт (§4).
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
        /** Защита публичного GET от безразмерного диапазона (год с запасом). */
        const val MAX_RANGE_DAYS = 366L
    }
}
