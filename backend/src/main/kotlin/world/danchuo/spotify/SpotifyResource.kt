package world.danchuo.spotify

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение музыкального слоя Spotify (PRD §M3). Всё на чтение и без токена
 * (креды нужны лишь на `/api/ingest/…`, §3); кэш — в [SpotifyService].
 *
 * - `GET /api/spotify/now-playing` — [NowPlayingView] (тихий IDLE, если ничего не играет
 *   или слайс не подключён).
 * - `GET /api/spotify/recent?limit=` — недавние треки ([RecentTrackView]).
 * - `GET /api/spotify/top?limit=&range=short|medium|long` — топ треков ([TrackView]).
 *
 * Неготовый слайс (не сконфигурирован / не пройден OAuth) отдаёт пустую форму с 200 —
 * фронт рисует тихое пустое состояние, без спец-ветки на «нет интеграции».
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

    /** Слайс готов отдавать живые данные: сконфигурирован и прошёл OAuth. */
    private fun ready(): Boolean = config.isConfigured() && tokenService.isConnected()

    /** Spotify ограничивает выдачу 1..50; клампим, чтобы не ловить 400 от внешнего API. */
    private fun clampLimit(raw: Int?, fallback: Int): Int = (raw ?: fallback).coerceIn(1, MAX_LIMIT)

    /** Маппинг дружелюбного `range` в окно Spotify; всё прочее — безопасный дефолт. */
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
