package world.danchuo.film

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public reads of photo drops: `/api/drops` lists them (the tile shows only the latest, the drops
 * page all of them), `/api/drops/{id}` returns a drop's frames for the gallery modal and 404s on
 * an unknown id. Token-free like every read (§3); before the first upload, empty is normal.
 */
@Path("/api/drops")
@Produces(MediaType.APPLICATION_JSON)
class FilmResource(
    private val film: FilmService,
) {

    @GET
    fun list(): List<FilmDropView> = film.publicList()

    @GET
    @Path("/{id}")
    fun photos(@PathParam("id") id: Long): Response {
        val frames = film.publicPhotos(id)
            ?: return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "drop_not_found", "id" to id))
                .build()
        return Response.ok(frames).build()
    }
}
