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

/** CSRF-`state` OAuth Instagram — свой на слайс (см. [OneTimeOAuthState]). */
@ApplicationScoped
class InstagramOAuthState : OneTimeOAuthState()

/**
 * Разовый OAuth Instagram (PRD §5.17). Поток личный и редкий, устроен как у Spotify:
 *
 * 1. `GET /api/ingest/instagram/authorize` (за bearer-токеном записи) — отдаёт ссылку согласия
 *    со свежим одноразовым `state`. Владелец открывает её в браузере и подтверждает доступ.
 * 2. Instagram редиректит на `GET /api/instagram/callback?code=&state=`.
 *
 * ⚠️ **Redirect URI обязан быть https** — петлевой `http://127.0.0.1` Instagram не принимает
 * (Spotify принимал). Поэтому подключение проходят на боевом домене, а токен при желании
 * переносят в локальную БД.
 *
 * Корни ресурсов специфичны (`/api/ingest/instagram`, `/api/instagram/callback`), чтобы не
 * пересекаться с [InstagramResource] (`/api/instagram`): JAX-RS выбирает самый длинный
 * совпавший корень и к менее специфичному не откатывается.
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
 * Публичный callback OAuth: Instagram редиректит сюда браузер после согласия. Путь публичный
 * (браузер не шлёт bearer) — защита сверкой одноразового `state`.
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
        // state гасим всегда (одноразовый) — даже если дальше отвалимся.
        if (!oauthState.consume(state)) return page(Response.Status.BAD_REQUEST, "Неверный или истёкший state.")
        if (code.isNullOrBlank()) return page(Response.Status.BAD_REQUEST, "Instagram не вернул code.")

        return try {
            // Код одноразовый и живёт минуты: повторять этот же запрос бессмысленно,
            // при ошибке начинают с authorize заново.
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
