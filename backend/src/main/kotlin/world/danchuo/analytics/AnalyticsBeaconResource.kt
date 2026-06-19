package world.danchuo.analytics

import io.vertx.core.http.HttpServerRequest
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичный бикон аналитики (PRD §5.11) — `POST /api/analytics/beacon`. **Вне** `api/ingest`,
 * поэтому открыт без токена: это не мутация владельца, а телеметрия посетителя (краулеры без
 * JS сюда не доходят). Cookieless: сырой IP не хранится — только суточный хэш ([VisitorHash]).
 *
 * Фронт шлёт два бикона на визит: load (без `dwellMs`) и добивку на уходе (`dwellMs`,
 * `navigator.sendBeacon`) с тем же `visitId` — сервис коррелирует их по визиту (§5.11).
 */
@Path("/api/analytics/beacon")
class AnalyticsBeaconResource(
    private val service: AnalyticsService,
) {

    data class BeaconRequest(
        val visitId: String? = null,
        val path: String? = null,
        val dwellMs: Int? = null,
        val referrer: String? = null,
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun beacon(
        req: BeaconRequest,
        @Context headers: HttpHeaders,
        @Context request: HttpServerRequest,
    ): Response {
        val path = req.path?.takeIf { it.isNotBlank() }
            ?: return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "missing_field", "field" to "path"))
                .build()

        service.record(
            visitId = req.visitId,
            path = path,
            dwellMs = req.dwellMs,
            referrer = req.referrer ?: headers.getHeaderString("Referer"),
            ip = clientIp(headers, request),
            userAgent = headers.getHeaderString(HttpHeaders.USER_AGENT),
            acceptLanguage = headers.getHeaderString(HttpHeaders.ACCEPT_LANGUAGE),
        )
        return Response.noContent().build()
    }

    /** IP клиента: первый из `X-Forwarded-For` (за прокси Caddy) → иначе адрес соединения. */
    private fun clientIp(headers: HttpHeaders, request: HttpServerRequest): String {
        val forwarded = headers.getHeaderString("X-Forwarded-For")
            ?.split(",")?.firstOrNull()?.trim()
            ?.takeIf { it.isNotBlank() }
        return forwarded ?: request.remoteAddress()?.host() ?: "unknown"
    }
}
