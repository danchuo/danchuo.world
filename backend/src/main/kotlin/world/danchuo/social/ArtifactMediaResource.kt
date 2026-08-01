package world.danchuo.social

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.Response

/**
 * Раздача картинок артефактов, заведённых через `/admin` (PRD §5.8). Публично, как медиа дропов.
 *
 * Кэш короче, чем у кадров: картинку артефакта можно переснять и заменить, оставив тот же id,
 * и висящая неделю копия в браузере была бы неприятным сюрпризом.
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
