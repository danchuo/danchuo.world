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
    private val sources: SpotifySourceResolver,
    private val config: SpotifyConfig,
) {

    @CacheResult(cacheName = "spotify-now-playing")
    fun nowPlaying(): NowPlayingView {
        // Просим и эпизоды: плитка показывает, что играет СЕЙЧАС, и подкаст — такой же ответ на
        // этот вопрос, как трек. Без `episode` в списке Spotify его просто не отдаёт, и плитка
        // молчала «ничего не играет» посреди часового эпизода.
        // Запись прослушанного этим не занимается — у неё свой такт ([PodcastPoller]): здешний
        // опрос будит зритель, и как логгер он бесполезен.
        // 204 (ничего не играет) ⇒ тело null ⇒ единый «тихий» IDLE.
        val current = api.currentlyPlaying(tokenService.bearer(), "track,episode", config.podcast().market())
            ?: return NowPlayingView.IDLE
        return NowPlayingView(
            isPlaying = current.isPlaying,
            progressMs = current.progressMs,
            track = TrackView.from(current.item),
            source = resolveSource(current.context),
        )
    }

    /** Источник + дорезолвенное имя (плейлист/артист), кэш в [SpotifySourceResolver]. */
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
