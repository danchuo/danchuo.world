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
 * Client for `accounts.spotify.com`, the OAuth token endpoint: a form-urlencoded body with Basic
 * `client_id:client_secret` prepared by [SpotifyTokenService]. One method serves both grants —
 * the first exchange and every refresh differ only in form fields.
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
 * The token endpoint's reply. `refresh_token` arrives on the first code exchange; on a refresh
 * Spotify usually does NOT send it, and we reuse the previous one.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyTokenResponse(
    @param:JsonProperty("access_token") val accessToken: String? = null,
    @param:JsonProperty("token_type") val tokenType: String? = null,
    @param:JsonProperty("expires_in") val expiresIn: Long? = null,
    @param:JsonProperty("refresh_token") val refreshToken: String? = null,
    @param:JsonProperty("scope") val scope: String? = null,
)
