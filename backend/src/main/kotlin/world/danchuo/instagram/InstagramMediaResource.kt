package world.danchuo.instagram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.Response

/**
 * Serves the downloaded Instagram images, post frame and avatar, publicly like drop and artifact
 * media. The cache is deliberately SHORT: tomorrow the next post lives at these same two
 * addresses, and a week-old copy would pair yesterday's frame with today's caption.
 */
@Path("/api/instagram-media")
class InstagramMediaResource(private val storage: InstagramImageStorage) {

    @GET
    @Path("/{kind}")
    fun image(@PathParam("kind") kind: String): Response {
        val parsed = runCatching { InstagramImageStorage.Kind.valueOf(kind.uppercase()) }.getOrNull()
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val bytes = storage.get(parsed)
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val cache = CacheControl().apply { maxAge = 3600 }
        // The type is read off the bytes: Instagram serves JPEG and, for avatars, WebP.
        return Response.ok(bytes, sniff(bytes)).cacheControl(cache).build()
    }

    /**
     * Format signature from the first bytes. Storage keeps what arrived without re-encoding:
     * re-encoding a frame for the sake of a known extension loses quality for nothing.
     */
    private fun sniff(bytes: ByteArray): String = when {
        bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() -> "image/jpeg"
        bytes.size >= 8 && bytes[1] == 'P'.code.toByte() && bytes[2] == 'N'.code.toByte() -> "image/png"
        bytes.size >= 12 && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP" -> "image/webp"
        else -> "application/octet-stream"
    }
}
