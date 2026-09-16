package world.danchuo.reading

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import java.nio.file.Files
import kotlin.io.path.extension

/**
 * Public reads of the `reading` slice. Sessions do not travel on their own — they ride inside the
 * day projection — so only covers live here. A cover is addressed BY SESSION ID, never by a path
 * from the phone's database: that path must not reach routing. PRD §5.16
 */
@Path("/api/reading")
class ReadingResource(
    private val sessions: ReadingSessionRepository,
    private val shelf: AnxShelf,
) {

    @GET
    @Path("/cover/{sessionId}")
    @Produces(MediaType.APPLICATION_OCTET_STREAM)
    fun cover(@PathParam("sessionId") sessionId: Long): Response {
        val coverPath = sessions.findById(sessionId)?.coverPath
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val file = shelf.coverFile(coverPath)
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        val bytes = runCatching { Files.readAllBytes(file) }.getOrNull()
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        // A book cover never changes within a session's life (change it and the reader writes a
        // NEW file under a new name, see book_detail in the Anx sources), so cache it long.
        val cache = CacheControl().apply {
            maxAge = 60 * 60 * 24 * 30 // 30 days
            isPrivate = false
        }
        return Response.ok(bytes, mediaTypeOf(file.extension)).cacheControl(cache).build()
    }

    /** Anx writes png/jpeg covers; the extension is enough, we do not read the file magic. */
    private fun mediaTypeOf(extension: String): String = when (extension.lowercase()) {
        "png" -> "image/png"
        "webp" -> "image/webp"
        else -> "image/jpeg"
    }
}
