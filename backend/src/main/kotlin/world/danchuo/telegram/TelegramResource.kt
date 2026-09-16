package world.danchuo.telegram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public reads of the Telegram card and its downloaded avatar. No card yet — the first tick has
 * not run, or the channel is silent — answers **204**, not 404 and not an empty object: the tile
 * must tell "nothing to show" from a breakage and simply draw nothing. DESIGN §7
 */
@Path("/api/telegram")
class TelegramResource(private val collector: TelegramProfileCollector) {

    @GET
    @Path("/profile")
    @Produces(MediaType.APPLICATION_JSON)
    fun profile(): Response {
        val profile = collector.current() ?: return Response.noContent().build()
        return Response.ok(
            TelegramProfileView(
                name = profile.name,
                username = profile.username,
                bio = profile.bio,
                // The version comes from the fetch stamp: the file name does not depend on the
                // picture, so a changed avatar would keep serving the browser's cached copy.
                avatarUrl = collector.currentAvatar()?.let { "/api/telegram/avatar?v=${it.version}" },
            ),
        ).build()
    }

    @GET
    @Path("/avatar")
    fun avatar(): Response {
        val avatar = collector.currentAvatar() ?: return Response.status(Response.Status.NOT_FOUND).build()
        // An hour is safe because the address carries a version: a new avatar arrives by new URL.
        val cache = CacheControl().apply { maxAge = 3600 }
        return Response.ok(avatar.bytes, avatar.contentType).cacheControl(cache).build()
    }
}
