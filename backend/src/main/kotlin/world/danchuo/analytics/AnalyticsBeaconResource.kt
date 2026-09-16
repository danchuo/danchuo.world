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
 * The public beacon. It sits OUTSIDE `api/ingest` and so needs no token: this is visitor
 * telemetry, not an owner mutation. Two beacons per visit share a `visitId`, and the service
 * correlates them by it. PRD §5.11
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

    /** Client IP: first of `X-Forwarded-For` (behind the Caddy proxy), else the connection address. */
    private fun clientIp(headers: HttpHeaders, request: HttpServerRequest): String {
        val forwarded = headers.getHeaderString("X-Forwarded-For")
            ?.split(",")?.firstOrNull()?.trim()
            ?.takeIf { it.isNotBlank() }
        return forwarded ?: request.remoteAddress()?.host() ?: "unknown"
    }
}
