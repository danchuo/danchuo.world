package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import world.danchuo.core.oauth.OneTimeOAuthState
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Instagram OAuth CSRF `state` — one per slice (see [OneTimeOAuthState]). */
@ApplicationScoped
class InstagramOAuthState : OneTimeOAuthState()

/**
 * One-off Instagram OAuth, shaped like Spotify's: authorize hands back a consent link carrying a
 * fresh one-time `state`, and the callback completes it. The redirect URI MUST be https — the
 * loopback address is refused. Resource roots are specific so JAX-RS cannot mismatch. PRD §5.17
 */
@Path("/api/ingest/instagram")
class InstagramAuthResource(
    private val config: InstagramConfig,
    private val oauthState: InstagramOAuthState,
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
        const val AUTHORIZE_ENDPOINT = "https://www.instagram.com/oauth/authorize"
    }
}

/**
 * Public OAuth callback: Instagram redirects the browser here after consent. The path is public
 * (a browser sends no bearer) and is protected by checking the one-time `state`.
 */
@Path("/api/instagram/callback")
class InstagramCallbackResource(
    private val oauthState: InstagramOAuthState,
    private val tokenService: InstagramTokenService,
) {

    @GET
    @Produces(MediaType.TEXT_HTML)
    fun callback(
        @QueryParam("code") code: String?,
        @QueryParam("state") state: String?,
        @QueryParam("error") error: String?,
    ): Response {
        if (error != null) return page(Response.Status.BAD_REQUEST, "Instagram отказал: $error")
        // The state is always burned (it is one-time), even if we fail further down.
        if (!oauthState.consume(state)) return page(Response.Status.BAD_REQUEST, "Неверный или истёкший state.")
        if (code.isNullOrBlank()) return page(Response.Status.BAD_REQUEST, "Instagram не вернул code.")

        return try {
            // The code is one-time and lives minutes: repeating this request is pointless, and
            // after an error you start again from authorize.
            tokenService.exchangeCode(code)
            page(Response.Status.OK, "Instagram подключён. Можно закрыть вкладку.")
        } catch (e: Exception) {
            page(Response.Status.BAD_GATEWAY, "Не удалось обменять код: ${e.message}")
        }
    }

    private fun page(status: Response.Status, message: String): Response =
        Response.status(status)
            .type(MediaType.TEXT_HTML)
            .entity("<!doctype html><meta charset=utf-8><title>danchuo.world · Instagram</title><p>$message</p>")
            .build()
}
