package world.danchuo.days

import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider
import java.time.LocalDate

/**
 * Ingest за дату раньше генезиса (PRD §4: «раньше неё пусто»). Любой `ingest/…`,
 * проходящий через [DayRecordService], отвергает такую дату — данных до отсчёта нет.
 */
class DateBeforeGenesisException(val date: LocalDate, val genesis: LocalDate) :
    RuntimeException("date $date is before genesis $genesis")

/** 422 на попытку записать день раньше генезиса — клиенту понятная ошибка, не 500. */
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
