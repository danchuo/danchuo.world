package world.danchuo.spotify

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * One-off Spotify OAuth, a personal and rare flow: authorize (behind the write bearer) hands back
 * a consent link carrying a fresh one-time `state`, and Spotify redirects to the callback. The
 * resource roots are deliberately specific — JAX-RS picks the longest match and never falls back.
 */
@Path("/api/ingest/spotify")
class SpotifyAuthResource(
    private val config: SpotifyConfig,
    private val oauthState: SpotifyOAuthState,
) {

    @GET
    @Path("/authorize")
    @Produces(MediaType.APPLICATION_JSON)
    fun authorize(): Response {
        if (!config.isConfigured()) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                .entity(mapOf("error" to "not_configured"))
                .build()
        }
        val state = oauthState.issue()
        val url = buildString {
            append(AUTHORIZE_ENDPOINT)
            append("?response_type=code")
            append("&client_id=").append(enc(config.clientId().orElse("")))
            append("&scope=").append(enc(config.scopes()))
            append("&redirect_uri=").append(enc(config.redirectUri().orElse("")))
            append("&state=").append(enc(state))
        }
        return Response.ok(mapOf("authorizeUrl" to url)).build()
    }

    private fun enc(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private companion object {
        const val AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize"
    }
}

/**
 * The public OAuth callback Spotify redirects the browser to. The path must be public, as a
 * browser sends no bearer, so the guard here is the one-time `state`. It is a separate class with
 * a root more specific than [SpotifyResource]'s, or JAX-RS would hand the request to the reader.
 */
@Path("/api/spotify/callback")
class SpotifyCallbackResource(
    private val oauthState: SpotifyOAuthState,
    private val tokenService: SpotifyTokenService,
) {

    @GET
    @Produces(MediaType.TEXT_HTML)
    fun callback(
        @QueryParam("code") code: String?,
        @QueryParam("state") state: String?,
        @QueryParam("error") error: String?,
    ): Response {
        if (error != null) return page(Response.Status.BAD_REQUEST, "Spotify отказал: $error")
        // The state is always burned (it is one-time), even if we fail further down.
        if (!oauthState.consume(state)) return page(Response.Status.BAD_REQUEST, "Неверный или истёкший state.")
        if (code.isNullOrBlank()) return page(Response.Status.BAD_REQUEST, "Spotify не вернул code.")

        return try {
            tokenService.exchangeCode(code)
            page(Response.Status.OK, "Spotify подключён. Можно закрыть вкладку.")
        } catch (e: Exception) {
            page(Response.Status.BAD_GATEWAY, "Не удалось обменять код: ${e.message}")
        }
    }

    /** A minimal HTML result page — the callback is open in a browser. */
    private fun page(status: Response.Status, message: String): Response =
        Response.status(status)
            .type(MediaType.TEXT_HTML)
            .entity("<!doctype html><meta charset=utf-8><title>danchuo.world · Spotify</title><p>$message</p>")
            .build()
}
