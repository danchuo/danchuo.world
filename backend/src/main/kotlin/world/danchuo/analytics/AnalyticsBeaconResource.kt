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
import world.danchuo.core.security.ClientIp

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
        val path = req.path?.takeIf { it.isNotBlank() && it.length <= AnalyticsLimits.PATH }
            ?: return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "missing_field", "field" to "path"))
                .build()

        // visitId and referrer are opportunistic: an over-long one costs its own field, never
        // the whole beacon. The referrer falls back to a header, just as attacker-controlled.
        val referrer = (req.referrer ?: headers.getHeaderString("Referer"))
            ?.takeIf { it.length <= AnalyticsLimits.REFERRER }

        service.record(
            visitId = req.visitId?.takeIf { it.length <= AnalyticsLimits.VISIT_ID },
            path = path,
            dwellMs = req.dwellMs,
            referrer = referrer,
            ip = clientIp(headers, request),
            userAgent = headers.getHeaderString(HttpHeaders.USER_AGENT),
            acceptLanguage = headers.getHeaderString(HttpHeaders.ACCEPT_LANGUAGE),
        )
        return Response.noContent().build()
    }

    /** The visitor behind the proxy ([ClientIp]), else the connection address. */
    private fun clientIp(headers: HttpHeaders, request: HttpServerRequest): String =
        ClientIp.fromForwardedFor(headers.getHeaderString("X-Forwarded-For"))
            ?: request.remoteAddress()?.host()
            ?: "unknown"
}
