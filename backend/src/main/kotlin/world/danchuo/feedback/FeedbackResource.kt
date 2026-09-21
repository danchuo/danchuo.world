package world.danchuo.feedback

import io.vertx.core.http.HttpServerRequest
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.security.ClientIp

/**
 * The public note endpoint: outside `api/ingest` and token-free, like the analytics beacon. Unlike
 * the beacon it ANSWERS — a visitor who wrote to the author must learn whether it arrived, so a
 * rejection carries a machine code the form turns into a line of Russian. PRD §5.19
 */
@Path("/api/feedback")
class FeedbackResource(
    private val service: FeedbackService,
) {

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    fun submit(
        req: FeedbackRequest,
        @Context headers: HttpHeaders,
        @Context request: HttpServerRequest,
    ): Response {
        val outcome = service.submit(
            request = req,
            ip = clientIp(headers, request),
            userAgent = headers.getHeaderString(HttpHeaders.USER_AGENT),
            acceptLanguage = headers.getHeaderString(HttpHeaders.ACCEPT_LANGUAGE),
        )
        return when (outcome) {
            // A tripped honeypot is answered exactly like a stored note: the bot learns nothing.
            is FeedbackOutcome.Accepted, FeedbackOutcome.Discarded -> Response.noContent().build()
            is FeedbackOutcome.Rejected -> Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(errorBody(outcome))
                .build()
        }
    }

    private fun errorBody(rejected: FeedbackOutcome.Rejected): String {
        val field = rejected.field?.let { ""","field":"$it"""" } ?: ""
        return """{"error":"${rejected.error}"$field}"""
    }

    /** The visitor behind the proxy ([ClientIp]), else the connection address. */
    private fun clientIp(headers: HttpHeaders, request: HttpServerRequest): String =
        ClientIp.fromForwardedFor(headers.getHeaderString("X-Forwarded-For"))
            ?: request.remoteAddress()?.host()
            ?: "unknown"
}
