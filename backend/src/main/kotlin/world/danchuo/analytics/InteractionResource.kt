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
 * Public click collection, symmetric to [AnalyticsBeaconResource]: outside `api/ingest` and
 * token-free. Junk is dropped per item in [InteractionService], so this endpoint only accepts —
 * empty or missing `path` is a 400, anything else a 204. PRD §5.11
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

    /** Client IP: first of `X-Forwarded-For` (behind the Caddy proxy), else the connection address. */
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
