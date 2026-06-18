package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.MultivaluedMap
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Клиент `accounts.spotify.com` — OAuth token-эндпоинт (PRD §M3). Базовый URL —
 * `quarkus.rest-client.spotify-accounts.url`. Тело form-urlencoded, авторизация —
 * Basic `client_id:client_secret` в заголовке (готовит [SpotifyTokenService]).
 *
 * Один метод на оба гранта (`authorization_code` при первом OAuth и `refresh_token`
 * при перевыпуске) — различие лишь в полях формы.
 */
@RegisterRestClient(configKey = "spotify-accounts")
interface SpotifyAccountsClient {

    @POST
    @Path("/api/token")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Produces(MediaType.APPLICATION_JSON)
    fun token(
        @HeaderParam("Authorization") basicAuth: String,
        form: MultivaluedMap<String, String>,
    ): SpotifyTokenResponse
}

/**
 * Ответ token-эндпоинта. `refresh_token` приходит при первом обмене кода; при
 * рефреше Spotify его обычно НЕ присылает — тогда переиспользуем прежний.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyTokenResponse(
    @param:JsonProperty("access_token") val accessToken: String? = null,
    @param:JsonProperty("token_type") val tokenType: String? = null,
    @param:JsonProperty("expires_in") val expiresIn: Long? = null,
    @param:JsonProperty("refresh_token") val refreshToken: String? = null,
    @param:JsonProperty("scope") val scope: String? = null,
)
