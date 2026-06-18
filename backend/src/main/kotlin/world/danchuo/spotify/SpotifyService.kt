package world.danchuo.spotify

import io.quarkus.cache.CacheKey
import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * Музыкальный слой Spotify (PRD §M3): тянет плеер через [SpotifyApiClient] и сжимает в
 * публичные проекции ([SpotifyViews]). Кэш Caffeine гасит нагрузку и держит лимиты
 * Spotify (TTL в `application.properties`: now-playing ~20с, recent/top — минуты).
 *
 * Токен берётся из [SpotifyTokenService] (рефреш прозрачен). Неподключённый слайс
 * (нет OAuth) бросает [SpotifyNotConnectedException] — ресурс решает, как показать.
 */
@ApplicationScoped
class SpotifyService(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
) {

    @CacheResult(cacheName = "spotify-now-playing")
    fun nowPlaying(): NowPlayingView {
        // 204 (ничего не играет) ⇒ тело null ⇒ единый «тихий» IDLE.
        val current = api.currentlyPlaying(tokenService.bearer()) ?: return NowPlayingView.IDLE
        return NowPlayingView(
            isPlaying = current.isPlaying,
            progressMs = current.progressMs,
            track = TrackView.from(current.item),
        )
    }

    @CacheResult(cacheName = "spotify-recent")
    fun recent(@CacheKey limit: Int): List<RecentTrackView> =
        api.recentlyPlayed(tokenService.bearer(), limit).items
            .mapNotNull { history -> TrackView.from(history.track)?.let { RecentTrackView(it, history.playedAt) } }

    @CacheResult(cacheName = "spotify-top")
    fun top(@CacheKey limit: Int, @CacheKey timeRange: String): List<TrackView> =
        api.topTracks(tokenService.bearer(), limit, timeRange).items.mapNotNull { TrackView.from(it) }
}
