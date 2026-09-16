package world.danchuo.days

import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider
import java.time.LocalDate

/**
 * Ingest for a date before genesis (PRD §4). Every `ingest/...` route goes through
 * [DayRecordService], which rejects such a date — there is no data before the count starts.
 */
class DateBeforeGenesisException(val date: LocalDate, val genesis: LocalDate) :
    RuntimeException("date $date is before genesis $genesis")

/** 422 when writing a day before genesis — a clear client error rather than a 500. */
@Provider
class DateBeforeGenesisMapper : ExceptionMapper<DateBeforeGenesisException> {
    override fun toResponse(ex: DateBeforeGenesisException): Response =
        Response.status(422)
            .type(MediaType.APPLICATION_JSON)
            .entity(
                mapOf(
                    "error" to "date_before_genesis",
                    "date" to ex.date.toString(),
                    "genesis" to ex.genesis.toString(),
                ),
            )
            .build()
}
