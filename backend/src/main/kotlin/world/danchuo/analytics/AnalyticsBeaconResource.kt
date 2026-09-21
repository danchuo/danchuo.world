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
 * telemetry, not an owner mutation. Every beacon of a visit carries its `visitId` and merges
 * into one row. PRD §5.11
 */
@Path("/api/analytics/beacon")
class AnalyticsBeaconResource(
    private val service: AnalyticsService,
) {

    data class BeaconRequest(
        val visitId: String? = null,
        val path: String? = null,
        val dwellMs: Int? = null,
        val scrollPct: Int? = null,
        val referrer: String? = null,
        val utmSource: String? = null,
        val utmMedium: String? = null,
        val utmCampaign: String? = null,
        val waveKey: String? = null,
        val viewportW: Int? = null,
        val viewportH: Int? = null,
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

        // Everything but the path is opportunistic: an over-long value costs its own field and
        // never the whole beacon. The referrer falls back to a header, just as attacker-controlled.
        val referrer = fit(req.referrer ?: headers.getHeaderString("Referer"), AnalyticsLimits.REFERRER)

        service.record(
            visitId = fit(req.visitId, AnalyticsLimits.VISIT_ID),
            path = path,
            dwellMs = req.dwellMs,
            scrollPct = req.scrollPct,
            referrer = referrer,
            utmSource = fit(req.utmSource, AnalyticsLimits.UTM),
            utmMedium = fit(req.utmMedium, AnalyticsLimits.UTM),
            utmCampaign = fit(req.utmCampaign, AnalyticsLimits.UTM),
            waveKey = fit(req.waveKey, AnalyticsLimits.WAVE_KEY),
            viewportW = req.viewportW,
            viewportH = req.viewportH,
            ip = clientIp(headers, request),
            userAgent = headers.getHeaderString(HttpHeaders.USER_AGENT),
            acceptLanguage = headers.getHeaderString(HttpHeaders.ACCEPT_LANGUAGE),
        )
        return Response.noContent().build()
    }

    /** Keeps a value only while it fits its column; blank and over-long alike become `null`. */
    private fun fit(value: String?, limit: Int): String? =
        value?.trim()?.takeIf { it.isNotEmpty() && it.length <= limit }

    /** The visitor behind the proxy ([ClientIp]), else the connection address. */
    private fun clientIp(headers: HttpHeaders, request: HttpServerRequest): String =
        ClientIp.fromForwardedFor(headers.getHeaderString("X-Forwarded-For"))
            ?: request.remoteAddress()?.host()
            ?: "unknown"
}
