package world.danchuo.spotify

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public reads of the Spotify music layer — now-playing, recent and top — token-free like every
 * read (§3), with caching in [SpotifyService]. A slice that is unconfigured or has never been
 * authorized answers an empty shape with 200, so the frontend needs no special branch.
 */
@Path("/api/spotify")
@Produces(MediaType.APPLICATION_JSON)
class SpotifyResource(
    private val service: SpotifyService,
    private val tokenService: SpotifyTokenService,
    private val config: SpotifyConfig,
) {

    @GET
    @Path("/now-playing")
    fun nowPlaying(): Response =
        Response.ok(if (ready()) service.nowPlaying() else NowPlayingView.IDLE).build()

    @GET
    @Path("/recent")
    fun recent(@QueryParam("limit") limit: Int?): Response =
        Response.ok(if (ready()) service.recent(clampLimit(limit, DEFAULT_RECENT)) else emptyList<RecentTrackView>())
            .build()

    @GET
    @Path("/top")
    fun top(
        @QueryParam("limit") limit: Int?,
        @QueryParam("range") range: String?,
    ): Response =
        Response.ok(if (ready()) service.top(clampLimit(limit, DEFAULT_TOP), timeRange(range)) else emptyList<TrackView>())
            .build()

    /** The slice is ready to serve live data: configured and past OAuth. */
    private fun ready(): Boolean = config.isConfigured() && tokenService.isConnected()

    /** Spotify caps the page at 1..50; clamp it so the external API never answers 400. */
    private fun clampLimit(raw: Int?, fallback: Int): Int = (raw ?: fallback).coerceIn(1, MAX_LIMIT)

    /** Maps the friendly `range` to a Spotify window; anything else takes a safe default. */
    private fun timeRange(raw: String?): String = when (raw) {
        "short" -> "short_term"
        "long" -> "long_term"
        else -> "medium_term"
    }

    private companion object {
        const val MAX_LIMIT = 50
        const val DEFAULT_RECENT = 8
        const val DEFAULT_TOP = 10
    }
}
