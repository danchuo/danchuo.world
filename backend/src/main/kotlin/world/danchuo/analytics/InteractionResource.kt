package world.danchuo.analytics

import io.vertx.core.http.HttpServerRequest
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичный сбор кликов для хитмапы (PRD §5.11, B2) — `POST /api/analytics/interactions`.
 * Симметричен биконy [AnalyticsBeaconResource]: **вне** `api/ingest`, без токена (это телеметрия
 * посетителя, не мутация владельца), cookieless. Фронт копит клики и шлёт **батчем** на уходе
 * (`navigator.sendBeacon`), чтобы не спамить по событию.
 *
 * Анти-абуз эшелонирован (PRD §11): IP-рейтлимит (`RateLimitFilter` лимитит и этот POST) +
 * валидация/cap в [InteractionService]. Любой брак отбрасывается там поэлементно — здесь только
 * приём: пустой/без `path` ⇒ 400, иначе 204 (телеметрия не должна светить детали отбраковки).
 */
@Path("/api/analytics/interactions")
class InteractionResource(
    private val service: InteractionService,
) {

    data class InteractionsRequest(
        val visitId: String? = null,
        val path: String? = null,
        val clicks: List<ClickInput>? = null,
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    fun collect(
        req: InteractionsRequest,
        @Context headers: HttpHeaders,
        @Context request: HttpServerRequest,
    ): Response {
        val path = req.path?.takeIf { it.isNotBlank() && it.length <= MAX_PATH }
            ?: return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity("""{"error":"missing_field","field":"path"}""")
                .build()

        service.record(
            visitId = req.visitId?.takeIf { it.length <= MAX_VISIT_ID },
            path = path,
            clicks = req.clicks ?: emptyList(),
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

    private companion object {
        const val MAX_PATH = 512
        const val MAX_VISIT_ID = 64
    }
}
