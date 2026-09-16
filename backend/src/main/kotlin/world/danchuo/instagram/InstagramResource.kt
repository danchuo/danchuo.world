package world.danchuo.instagram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public read of the latest post (PRD §5.17): `GET /api/instagram/latest`. An unconnected account
 * or an unfetched post answers 204, not 404 and not an empty object: the tile must tell "nothing
 * to show" from a breakage and quietly draw no card (DESIGN §7).
 */
@Path("/api/instagram")
class InstagramResource(
    private val posts: InstagramPostRepository,
    private val storage: InstagramImageStorage,
) {

    @GET
    @Path("/latest")
    @Produces(MediaType.APPLICATION_JSON)
    fun latest(): Response {
        val post = posts.current() ?: return Response.noContent().build()
        return Response.ok(post.toView(storage)).build()
    }
}
