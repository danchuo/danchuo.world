package world.danchuo.bike

import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/** Тело SMS-логина: код из присланного SMS. */
data class AuthorizeRequest(val code: String)

/**
 * Приватный приём поездок Велобайка (PRD §9 B4). Всё под `/api/ingest/…` ⇒ за статическим
 * bearer-токеном (фильтр ядра, §11) — отдельная авторизация не нужна.
 *
 * Два канала к одной модели ([BikeRideService.upsert]):
 * 1. **Push (работает уже сейчас, без Qrator):** `POST /api/ingest/bike/rides` принимает массив
 *    сырых поездок — ровно `content[]` из ответа приложения. Отдаёт iOS-шорткат или букмарклет на
 *    pwa.velobike.ru (уже прошедший Qrator и авторизацию в браузере владельца).
 * 2. **Серверный поллинг (за Qrator):** SMS-логин (`/authorize/code` → `/authorize`) сохраняет
 *    refresh-токен; `/poll` дёргает проход вручную. Поедет только через резидентный прокси (§13).
 */
@Path("/api/ingest/bike")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
class BikeIngestResource(
    private val service: BikeRideService,
    private val tokenService: VelobikeTokenService,
    private val poller: VelobikePoller,
) {

    /** Push-канал: массив поездок (`content[]` из приложения) → идемпотентный upsert. */
    @POST
    @Path("/rides")
    fun ingestRides(rides: List<RentItem>): UpsertResult = service.upsert(rides)

    /** Серверный поллинг: запросить SMS-код на телефон владельца (из конфига). */
    @POST
    @Path("/authorize/code")
    fun requestCode(): VelobikeCodeResponse = tokenService.requestCode()

    /** Серверный поллинг: завершить логин кодом из SMS — сохранить refresh-токен. */
    @POST
    @Path("/authorize")
    fun authorize(req: AuthorizeRequest): Response {
        tokenService.authenticate(req.code.trim())
        return Response.ok(mapOf("connected" to true)).build()
    }

    /** Ручной триггер прохода поллинга (диагностика/догон). */
    @POST
    @Path("/poll")
    fun poll(): UpsertResult = poller.pollOnce()
}
