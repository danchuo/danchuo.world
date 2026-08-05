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
 * Деталь ночи (PRD §5.4, реестр I-23): `GET /api/sleep/night/{date}`.
 *
 * Отдельный эндпоинт, а не поле в `DayView`, по двум причинам. Полоса нужна не всегда — тайл
 * «Сон» ходит за ней, только когда её попросили показать, и борд не платит за куски ночи при
 * каждой загрузке. И «обычная ночь» — это агрегат за 30 дней, которому не место в проекции
 * одного дня: он бы считался на каждый перефокус календаря.
 *
 * Публично на чтение, как и всё остальное (§11): бережём креды записи, а не контент.
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
 * Сборка детали ночи из сохранённых кусков. Кэшируется: куски меняются только на приёме.
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
 * Ответ эндпоинта: ночь, разложенная во времени.
 *
 * Профиля «обычной ночи» здесь **нет** (решение владельца 05.08.2026, см. PRD §5.4): он не
 * пережил переезда полосы на дорожки — вертикаль занята глубиной сна, и сравнение с привычным
 * окном свелось к бледной полоске под осью, которая уже ничего не отвечала.
 */
@RegisterForReflection
data class SleepNightView(
    val date: LocalDate,
    /** Час MSK, с которого идёт отсчёт минут в полосе. */
    val axisStartHour: Int,
    /** `null` = кусков за эту ночь нет (день пустой или запись велась до появления хранения). */
    val band: SleepBandView?,
)
