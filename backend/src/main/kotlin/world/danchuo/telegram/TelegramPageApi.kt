package world.danchuo.telegram

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * The public `t.me/{name}` card page — the one a profile link opens. It returns HTML rather than
 * JSON, because Telegram has no API for a user card at all (the parsing lives in
 * [TelegramProfileParser]). No Kotlin default parameters: the REST client ignores them.
 */
@RegisterRestClient(configKey = "telegram-page")
@Produces(MediaType.TEXT_HTML)
interface TelegramPageApi {

    /** `GET /{name}` — the card page with its OG tags, no authorization. */
    @GET
    @Path("/{username}")
    fun profilePage(
        @PathParam("username") username: String,
        @HeaderParam("User-Agent") userAgent: String,
    ): String
}
