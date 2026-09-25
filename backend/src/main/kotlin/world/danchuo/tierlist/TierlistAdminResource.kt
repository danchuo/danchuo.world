package world.danchuo.tierlist

import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/** Moderation of the public shelf: nicks are typed by strangers. Under `api/ingest` ⇒ bearer. §5.20 */
@Path("/api/ingest/tierlists")
@Produces(MediaType.APPLICATION_JSON)
class TierlistAdminResource(
    private val service: TierlistService,
) {

    @GET
    fun list(): List<TierlistAdminView> = service.listAll()

    @DELETE
    @Path("/{id}")
    fun delete(@PathParam("id") id: Long): Response =
        if (service.delete(id)) Response.noContent().build()
        else Response.status(Response.Status.NOT_FOUND).entity("""{"error":"not_found"}""").build()
}
