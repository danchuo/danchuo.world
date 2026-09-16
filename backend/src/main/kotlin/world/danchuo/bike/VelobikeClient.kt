package world.danchuo.bike

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/** Login body for `client-authenticate`: phone plus the 4-digit SMS code. */
data class VelobikeAuthRequest(val user: String, val password: String)

/**
 * REST client for the Velobike API. The refresh-to-access exchange is deliberately NOT here —
 * its path is unconfirmed, so it lives in config ([VelobikeTokenService]). These calls are barred
 * from a datacentre IP until traffic goes through a residential proxy. PRD §13
 */
@RegisterRestClient(configKey = "velobike")
@Produces(MediaType.APPLICATION_JSON)
interface VelobikeClient {

    /** Request an SMS code to the phone: `POST /api/api-auth/code/{phone}`. */
    @POST
    @Path("/api/api-auth/code/{phone}")
    fun requestCode(
        @PathParam("phone") phone: String,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
    ): VelobikeCodeResponse

    /** Login by phone and code: `POST /api/api-auth/client-authenticate`, returning tokens. */
    @POST
    @Path("/api/api-auth/client-authenticate")
    fun authenticate(
        body: VelobikeAuthRequest,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
    ): VelobikeAuthResponse

    /** Ride history page: `GET /api/rent/rents/client?size=&page=&statuses=TECH_DONE,DONE`. */
    @GET
    @Path("/api/rent/rents/client")
    fun listRents(
        @HeaderParam("Authorization") bearer: String,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
        @QueryParam("size") size: Int,
        @QueryParam("page") page: Int,
        @QueryParam("statuses") statuses: String,
    ): RentPage
}
