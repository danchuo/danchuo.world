package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Client for `api.spotify.com`, the read-only player layer; the access token goes in
 * `Authorization` on every call. The DTOs are a minimal projection — only the fields we render,
 * with unknown ones ignored, because the API is far richer than the board needs.
 */
@RegisterRestClient(configKey = "spotify-api")
interface SpotifyApiClient {

    /**
     * Current playback; "nothing playing" comes back as 204, so the body is `null`.
     * [additionalTypes] must include `episode` or podcasts never arrive at all, and [market] is
     * required in practice — without it Spotify calls the content unavailable and answers empty.
     */
    @GET
    @Path("/v1/me/player/currently-playing")
    @Produces(MediaType.APPLICATION_JSON)
    fun currentlyPlaying(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("additional_types") additionalTypes: String,
        @QueryParam("market") market: String,
    ): SpotifyCurrentlyPlaying?

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

    /** Playlist name by id (for the source line). `fields=name` returns only the name. */
    @GET
    @Path("/v1/playlists/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    fun playlist(
        @HeaderParam("Authorization") bearer: String,
        @PathParam("id") id: String,
        @QueryParam("fields") fields: String,
    ): SpotifyNamed

    /** Artist name by id (for the source line, when playing from an artist page). */
    @GET
    @Path("/v1/artists/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    fun artist(
        @HeaderParam("Authorization") bearer: String,
        @PathParam("id") id: String,
    ): SpotifyNamed
}

/** Minimal "object with a name" projection — a playlist or artist (we take only name). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyNamed(
    @param:JsonProperty("name") val name: String? = null,
)

// -- Raw Spotify Web API DTOs (only the fields we need) --

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyCurrentlyPlaying(
    @param:JsonProperty("is_playing") val isPlaying: Boolean = false,
    @param:JsonProperty("progress_ms") val progressMs: Long? = null,
    @param:JsonProperty("item") val item: SpotifyTrack? = null,
    // Where it plays from: playlist/album/artist/podcast/liked. May be null (outside a context).
    @param:JsonProperty("context") val context: SpotifyContext? = null,
    // "track" or "episode" — the union discriminator for [item]. It duplicates item.type but
    // arrives even when item itself is empty, so deciding by it is more reliable.
    @param:JsonProperty("currently_playing_type") val currentlyPlayingType: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyContext(
    @param:JsonProperty("type") val type: String? = null,
    @param:JsonProperty("uri") val uri: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyRecentlyPlayed(
    @param:JsonProperty("items") val items: List<SpotifyPlayHistory>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPlayHistory(
    @param:JsonProperty("track") val track: SpotifyTrack? = null,
    @param:JsonProperty("played_at") val playedAt: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPaging(
    @param:JsonProperty("items") val items: List<SpotifyTrack>? = null,
)

/**
 * Projection of the `item` field, which is a UNION of a track and a podcast episode told apart by
 * [type]: both carry a name, duration and link, then diverge into artists and album, or [show] and
 * its own [images]. One type rather than two, since Jackson parses one field; halves stay empty.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyTrack(
    @param:JsonProperty("id") val id: String? = null,
    @param:JsonProperty("type") val type: String? = null,
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("artists") val artists: List<SpotifyArtist>? = null,
    @param:JsonProperty("album") val album: SpotifyAlbum? = null,
    @param:JsonProperty("duration_ms") val durationMs: Long? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
    // Episode cover: a track's picture lives on its album, an episode's sits directly on it.
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
    @param:JsonProperty("show") val show: SpotifyShow? = null,
)

/**
 * The podcast show inside an episode. The nested object carries no `publisher`, so [name] serves
 * as the card's author; the real publisher would mean a trip to `/v1/shows/{id}` (rejected: the
 * show name is enough).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyShow(
    @param:JsonProperty("id") val id: String? = null,
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
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
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
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
