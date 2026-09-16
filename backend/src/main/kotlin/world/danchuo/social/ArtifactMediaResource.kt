package world.danchuo.social

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.Response

/**
 * Serves artifact pictures created through `/admin` (PRD §5.8). Public, like drop media. The
 * cache is shorter than for frames: an artifact picture can be redrawn and replaced under the
 * same id, and a week-old copy in a browser would be an unpleasant surprise.
 */
@Path("/api/artifact-media")
class ArtifactMediaResource(
    private val storage: ArtifactImageStorage,
) {

    @GET
    @Path("/{id}")
    fun image(@PathParam("id") id: Long): Response {
        val bytes = storage.get(id)
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val cache = CacheControl().apply { maxAge = 3600 }
        return Response.ok(bytes, "image/png").cacheControl(cache).build()
    }
}
