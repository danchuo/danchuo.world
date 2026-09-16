package world.danchuo.spotify

import io.quarkus.cache.CacheKey
import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * The Spotify music layer: pulls the player and squeezes it into public projections, with a
 * Caffeine cache absorbing load and respecting Spotify's limits (TTLs in `application.properties`).
 * An unconnected slice throws [SpotifyNotConnectedException] and the resource decides how to show.
 */
@ApplicationScoped
class SpotifyService(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
    private val sources: SpotifySourceResolver,
    private val config: SpotifyConfig,
) {

    @CacheResult(cacheName = "spotify-now-playing")
    fun nowPlaying(): NowPlayingView {
        // Episodes are requested too: the tile shows what is playing NOW, and a podcast answers
        // that question as well as a track does. Without `episode` in the list Spotify withholds
        // it and the tile said "nothing playing" in the middle of an hour-long episode.
        val current = api.currentlyPlaying(tokenService.bearer(), "track,episode", config.podcast().market())
            ?: return NowPlayingView.IDLE
        return NowPlayingView(
            isPlaying = current.isPlaying,
            progressMs = current.progressMs,
            track = TrackView.from(current.item),
            source = resolveSource(current.context),
        )
    }

    /** The source plus its resolved name (playlist/artist), cached in [SpotifySourceResolver]. */
    private fun resolveSource(context: SpotifyContext?): SourceRef? {
        val base = SourceRef.from(context) ?: return null
        val name = context?.uri?.let { sources.name(it) }
        return if (name == null) base else base.copy(name = name)
    }

    @CacheResult(cacheName = "spotify-recent")
    fun recent(@CacheKey limit: Int): List<RecentTrackView> =
        api.recentlyPlayed(tokenService.bearer(), limit).items.orEmpty()
            .mapNotNull { history -> TrackView.from(history.track)?.let { RecentTrackView(it, history.playedAt) } }

    @CacheResult(cacheName = "spotify-top")
    fun top(@CacheKey limit: Int, @CacheKey timeRange: String): List<TrackView> =
        api.topTracks(tokenService.bearer(), limit, timeRange).items.orEmpty().mapNotNull { TrackView.from(it) }
}
