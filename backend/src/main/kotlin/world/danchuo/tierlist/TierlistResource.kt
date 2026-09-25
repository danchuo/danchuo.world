package world.danchuo.tierlist

import io.vertx.core.http.HttpServerRequest
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.security.ClientIp

/** Public shelf of tier lists: anyone reads, anyone publishes, no token. PRD §5.20 */
@Path("/api/tierlists")
class TierlistResource(
    private val service: TierlistService,
) {

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun list(): List<TierlistView> = service.listPublic()

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    fun publish(
        req: TierlistRequest,
        @Context headers: HttpHeaders,
        @Context request: HttpServerRequest,
    ): Response {
        val outcome = service.publish(
            request = req,
            ip = ClientIp.fromForwardedFor(headers.getHeaderString("X-Forwarded-For"))
                ?: request.remoteAddress()?.host()
                ?: "unknown",
            userAgent = headers.getHeaderString(HttpHeaders.USER_AGENT),
            acceptLanguage = headers.getHeaderString(HttpHeaders.ACCEPT_LANGUAGE),
        )
        return when (outcome) {
            // A tripped honeypot is answered like a stored list with no id: the bot learns nothing.
            is TierlistOutcome.Accepted -> created(outcome.id)
            TierlistOutcome.Discarded -> created(0)
            is TierlistOutcome.Rejected -> {
                val field = outcome.field?.let { ""","field":"$it"""" } ?: ""
                val status = if (outcome.error == TierlistService.NICK_TAKEN) Response.Status.CONFLICT else Response.Status.BAD_REQUEST
                Response.status(status)
                    .type(MediaType.APPLICATION_JSON)
                    .entity("""{"error":"${outcome.error}"$field}""")
                    .build()
            }
        }
    }

    private fun created(id: Long): Response =
        Response.status(Response.Status.CREATED).type(MediaType.APPLICATION_JSON).entity("""{"id":$id}""").build()
}
