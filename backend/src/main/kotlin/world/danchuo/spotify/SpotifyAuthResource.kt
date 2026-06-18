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
 * One-time OAuth Spotify (PRD §M3). Поток личный и редкий:
 *
 * 1. `GET /api/ingest/spotify/authorize` (за bearer-токеном записи — [world.danchuo.core.security.IngestAuthFilter]
 *    стережёт префикс `/api/ingest`): отдаёт ссылку согласия Spotify со свежим
 *    одноразовым `state`. Владелец открывает её в браузере и подтверждает доступ.
 * 2. Spotify редиректит на `GET /api/spotify/callback?code=&state=` ([SpotifyCallbackResource]).
 *
 * Корни ресурсов специфичны (`/api/ingest/spotify`, `/api/spotify/callback`), чтобы НЕ
 * пересекаться с [SpotifyResource] (`/api/spotify`): JAX-RS выбирает самый длинный
 * совпавший корень и к менее специфичному уже не откатывается.
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
 * Публичный callback OAuth (PRD §M3): Spotify сюда редиректит браузер после согласия
 * (`?code=&state=`). Путь публичный (браузер не шлёт bearer) — защита здесь сверкой
 * одноразового `state`. Меняем код на токены, refresh кладём шифрованно
 * ([SpotifyTokenService.exchangeCode]).
 *
 * Отдельный класс с корнем `/api/spotify/callback` (специфичнее, чем `/api/spotify`
 * у [SpotifyResource]) — иначе JAX-RS отдал бы запрос read-ресурсу и вернул 404.
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
        // state гасим всегда (одноразовый) — даже если дальше отвалимся.
        if (!oauthState.consume(state)) return page(Response.Status.BAD_REQUEST, "Неверный или истёкший state.")
        if (code.isNullOrBlank()) return page(Response.Status.BAD_REQUEST, "Spotify не вернул code.")

        return try {
            tokenService.exchangeCode(code)
            page(Response.Status.OK, "Spotify подключён. Можно закрыть вкладку.")
        } catch (e: Exception) {
            page(Response.Status.BAD_GATEWAY, "Не удалось обменять код: ${e.message}")
        }
    }

    /** Минимальная HTML-страница итога — callback открыт в браузере. */
    private fun page(status: Response.Status, message: String): Response =
        Response.status(status)
            .type(MediaType.TEXT_HTML)
            .entity("<!doctype html><meta charset=utf-8><title>danchuo.world · Spotify</title><p>$message</p>")
            .build()
}
