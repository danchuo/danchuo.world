package world.danchuo.bike

import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

data class AuthorizeRequest(val code: String)

/**
 * Private Velobike ride ingest, behind the core's bearer filter like everything under
 * `/api/ingest`. Two delivery channels reach one model ([BikeRideService.upsert]): a push of raw
 * rides that works today, and server polling that needs a residential proxy. PRD §9 B4
 */
@Path("/api/ingest/bike")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
class BikeIngestResource(
    private val service: BikeRideService,
    private val tokenService: VelobikeTokenService,
    private val poller: VelobikePoller,
) {

    @POST
    @Path("/rides")
    fun ingestRides(rides: List<RentItem>): UpsertResult = service.upsert(rides)

    /**
     * Push channel: purchase-history records (`content[]` from `purchases/history`) to an
     * idempotent tariff upsert. The service drops `RENTAL` records itself, so send everything
     * as is. Needed to attribute free rides to the tariff that paid for them.
     */
    @POST
    @Path("/tariffs")
    fun ingestTariffs(purchases: List<PurchaseItem>): UpsertResult = service.upsertTariffs(purchases)

    /** Server polling: request an SMS code to the owner's phone (from config). */
    @POST
    @Path("/authorize/code")
    fun requestCode(): VelobikeCodeResponse = tokenService.requestCode()

    /** Server polling: finish the login with the SMS code and store the refresh token. */
    @POST
    @Path("/authorize")
    fun authorize(req: AuthorizeRequest): Response {
        tokenService.authenticate(req.code.trim())
        return Response.ok(mapOf("connected" to true)).build()
    }

    /** Manual polling trigger (diagnostics / catching up). */
    @POST
    @Path("/poll")
    fun poll(): UpsertResult = poller.pollOnce()
}
