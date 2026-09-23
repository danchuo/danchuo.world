package world.danchuo.core.cache

import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.EntityTag
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Request
import jakarta.ws.rs.core.Response
import java.security.MessageDigest
import java.util.Base64

/**
 * A public JSON read that the browser revalidates instead of downloading again: `no-cache` plus an
 * ETag over the exact bytes, so an unchanged answer costs a 304 without a body. PRD §8
 */
@ApplicationScoped
class JsonRevalidation(private val mapper: ObjectMapper) {

    fun respond(request: Request, body: Any): Response {
        val bytes = mapper.writeValueAsBytes(body)
        // Weak on purpose: the edge compresses the body, and a strong tag would no longer match it.
        val tag = EntityTag(digest(bytes), true)
        val notModified = request.evaluatePreconditions(tag)
        val builder = notModified ?: Response.ok(bytes, MediaType.APPLICATION_JSON_TYPE)
        return builder.tag(tag).cacheControl(REVALIDATE).build()
    }

    private fun digest(bytes: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes).copyOf(16))

    private companion object {
        val REVALIDATE: CacheControl = CacheControl().apply {
            isNoCache = true
            isNoTransform = false
        }
    }
}
