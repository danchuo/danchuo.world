package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Публичные read-проекции музыкального слоя (PRD §M3) — то, что отдают `GET /api/spotify/…`
 * и рендерит фронтовый MusicTile. Сжимаем богатый Spotify-ответ до нужного минимума;
 * атрибуция (ссылка на трек в Spotify) сохраняется в [TrackView.url] (PRD §M3 — аккуратная
 * атрибуция Spotify).
 */

/** Исполнитель со ссылкой-атрибуцией на его страницу в Spotify. */
data class ArtistRef(
    val name: String,
    /** Ссылка на артиста в Spotify, `null` — если не пришла. */
    val url: String?,
)

/** Альбом со ссылкой-атрибуцией на его страницу в Spotify. */
data class AlbumRef(
    val name: String,
    /** Ссылка на альбом в Spotify, `null` — если не пришла. */
    val url: String?,
)

/** Один трек в человекочитаемом виде. */
data class TrackView(
    val title: String,
    /** Исполнители (Spotify отдаёт список); каждый со своей ссылкой. */
    val artists: List<ArtistRef>,
    /** Альбом; `null` для синглов и одноимённых релизов (не дублируем название трека). */
    val album: AlbumRef?,
    /** Обложка альбома (самая крупная из отданных), `null` — если нет. */
    val albumImageUrl: String?,
    /** Ссылка на трек в Spotify (атрибуция), `null` — если не пришла. */
    val url: String?,
    val durationMs: Long?,
) {
    companion object {
        /** Сжать сырой [SpotifyTrack] в проекцию; `null`, если трека по сути нет. */
        fun from(track: SpotifyTrack?): TrackView? {
            val title = track?.name?.takeIf { it.isNotBlank() } ?: return null
            val album = track.album
            // Альбом не показываем, если это сингл или его имя совпадает с названием трека
            // (одноимённый релиз — дубль ни к чему).
            val isSingle = album?.albumType.equals("single", ignoreCase = true)
            val albumRef = album?.name
                ?.takeIf { it.isNotBlank() }
                ?.takeUnless { isSingle || it.equals(title, ignoreCase = true) }
                ?.let { AlbumRef(it, album.externalUrls?.spotify) }
            return TrackView(
                title = title,
                artists = track.artists.mapNotNull { artist ->
                    artist.name?.takeIf(String::isNotBlank)?.let { ArtistRef(it, artist.externalUrls?.spotify) }
                },
                album = albumRef,
                // Берём самую большую обложку (Spotify сортирует по убыванию, но не полагаемся).
                albumImageUrl = album?.images?.maxByOrNull { (it.width ?: 0) * (it.height ?: 0) }?.url,
                url = track.externalUrls?.spotify,
                durationMs = track.durationMs,
            )
        }
    }
}

/**
 * Состояние «сейчас играет». [track] = `null` ⇒ ничего не играет (или не подключено) —
 * фронт рисует тихое пустое состояние, без спец-ветки.
 */
data class NowPlayingView(
    // Без явного имени Jackson срезал бы `is`-префикс булева → поле «playing»;
    // держим контракт `isPlaying` в зеркале с фронтом (TrackView/progressMs — camelCase).
    @get:JsonProperty("isPlaying") val isPlaying: Boolean,
    val progressMs: Long?,
    val track: TrackView?,
) {
    companion object {
        /** Тихое «ничего не играет» — единая форма для 204 и неподключённого слайса. */
        val IDLE = NowPlayingView(isPlaying = false, progressMs = null, track = null)
    }
}

/** Недавно сыгранный трек с меткой времени проигрывания (ISO-8601 из Spotify). */
data class RecentTrackView(
    val track: TrackView,
    val playedAt: String?,
)
