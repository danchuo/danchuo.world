package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Клиент `api.spotify.com` — read-only слой плеера (PRD §M3). Базовый URL —
 * `quarkus.rest-client.spotify-api.url`. Access-токен передаётся в `Authorization:
 * Bearer …` на каждый вызов (его готовит [SpotifyTokenService] из refresh-токена).
 *
 * DTO — минимальная проекция Spotify-ответов: берём только поля, что рендерим,
 * `@JsonIgnoreProperties(ignoreUnknown = true)` глушит остальное (API богат).
 */
@RegisterRestClient(configKey = "spotify-api")
interface SpotifyApiClient {

    /** Текущий трек; при «ничего не играет» Spotify отдаёт 204 ⇒ тело `null`. */
    @GET
    @Path("/v1/me/player/currently-playing")
    @Produces(MediaType.APPLICATION_JSON)
    fun currentlyPlaying(@HeaderParam("Authorization") bearer: String): SpotifyCurrentlyPlaying?

    @GET
    @Path("/v1/me/player/recently-played")
    @Produces(MediaType.APPLICATION_JSON)
    fun recentlyPlayed(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("limit") limit: Int,
    ): SpotifyRecentlyPlayed

    @GET
    @Path("/v1/me/top/tracks")
    @Produces(MediaType.APPLICATION_JSON)
    fun topTracks(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("limit") limit: Int,
        @QueryParam("time_range") timeRange: String,
    ): SpotifyPaging
}

// ── Сырые DTO Spotify Web API (только нужные поля) ──

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyCurrentlyPlaying(
    @param:JsonProperty("is_playing") val isPlaying: Boolean = false,
    @param:JsonProperty("progress_ms") val progressMs: Long? = null,
    @param:JsonProperty("item") val item: SpotifyTrack? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyRecentlyPlayed(
    @param:JsonProperty("items") val items: List<SpotifyPlayHistory> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPlayHistory(
    @param:JsonProperty("track") val track: SpotifyTrack? = null,
    @param:JsonProperty("played_at") val playedAt: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPaging(
    @param:JsonProperty("items") val items: List<SpotifyTrack> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyTrack(
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("artists") val artists: List<SpotifyArtist> = emptyList(),
    @param:JsonProperty("album") val album: SpotifyAlbum? = null,
    @param:JsonProperty("duration_ms") val durationMs: Long? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyArtist(
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyAlbum(
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("album_type") val albumType: String? = null,
    @param:JsonProperty("images") val images: List<SpotifyImage> = emptyList(),
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyImage(
    @param:JsonProperty("url") val url: String? = null,
    @param:JsonProperty("width") val width: Int? = null,
    @param:JsonProperty("height") val height: Int? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyExternalUrls(
    @param:JsonProperty("spotify") val spotify: String? = null,
)
