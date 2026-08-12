package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Публичные read-проекции музыкального слоя (PRD §M3) — то, что отдают `GET /api/spotify/…`
 * и рендерит фронтовый MusicTile. Сжимаем богатый Spotify-ответ до нужного минимума;
 * атрибуция (ссылка на трек в Spotify) сохраняется в [TrackView.url] (PRD §M3 — аккуратная
 * атрибуция Spotify).
 */

/** Исполнитель со ссылкой-атрибуцией на его страницу в Spotify. */
// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).
@RegisterForReflection
data class ArtistRef(
    val name: String,
    /** Ссылка на артиста в Spotify, `null` — если не пришла. */
    val url: String?,
)

/** Альбом со ссылкой-атрибуцией на его страницу в Spotify. */
@RegisterForReflection
data class AlbumRef(
    val name: String,
    /** Ссылка на альбом в Spotify, `null` — если не пришла. */
    val url: String?,
)

/** Один трек в человекочитаемом виде. */
@RegisterForReflection
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

            // Эпизод подкаста укладывается в ту же форму без единого нового поля: «исполнитель» —
            // это шоу (со своей ссылкой), обложка у эпизода собственная, альбома нет вовсе.
            // Плитка уже умеет молчать про отсутствующий альбом, поэтому рисуется как есть.
            track.show?.let { show ->
                return TrackView(
                    title = title,
                    artists = listOfNotNull(
                        show.name
                            ?.takeIf(String::isNotBlank)
                            ?.let { ArtistRef(it, show.externalUrls?.spotify) },
                    ),
                    album = null,
                    albumImageUrl = track.images.largest() ?: show.images.largest(),
                    url = track.externalUrls?.spotify,
                    durationMs = track.durationMs,
                )
            }

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
                artists = track.artists.orEmpty().mapNotNull { artist ->
                    artist.name?.takeIf(String::isNotBlank)?.let { ArtistRef(it, artist.externalUrls?.spotify) }
                },
                album = albumRef,
                // Берём самую большую обложку (Spotify сортирует по убыванию, но не полагаемся).
                albumImageUrl = album?.images.largest(),
                url = track.externalUrls?.spotify,
                durationMs = track.durationMs,
            )
        }
    }
}

/** Самая крупная обложка из отданных; Spotify сортирует по убыванию, но не полагаемся. */
private fun List<SpotifyImage>?.largest(): String? =
    orEmpty().maxByOrNull { (it.width ?: 0) * (it.height ?: 0) }?.url

/**
 * Источник воспроизведения (PRD §M3): откуда играет трек. Альбом сюда НЕ кладём —
 * он уже показан строкой альбома ([TrackView.album]); источник — про плейлист/артиста/
 * подкаст/«любимое». `null`, если контекста нет или у него нет ссылки.
 */
@RegisterForReflection
data class SourceRef(
    /** Тип контекста Spotify: `playlist` / `artist` / `collection` / `show`. */
    val type: String,
    /** Ссылка на источник в Spotify. */
    val url: String,
    /** Имя источника (плейлиста/артиста). `null`, если не удалось получить — фронт покажет тип. */
    val name: String?,
) {
    companion object {
        /** Базовый ([type]+[url]) без имени — имя дорезолвивает [SpotifyService] доп. запросом. */
        fun from(context: SpotifyContext?): SourceRef? {
            val type = context?.type?.takeIf { it.isNotBlank() } ?: return null
            // Альбом уже выводится отдельной строкой — источником не дублируем.
            if (type.equals("album", ignoreCase = true)) return null
            val url = context.externalUrls?.spotify?.takeIf { it.isNotBlank() } ?: return null
            return SourceRef(type, url, name = null)
        }
    }
}

/**
 * Состояние «сейчас играет». [track] = `null` ⇒ ничего не играет (или не подключено) —
 * фронт рисует тихое пустое состояние, без спец-ветки. [source] — откуда играет
 * (плейлист/артист/подкаст), `null` для альбома и «вне контекста».
 */
@RegisterForReflection
data class NowPlayingView(
    // Без явного имени Jackson срезал бы `is`-префикс булева → поле «playing»;
    // держим контракт `isPlaying` в зеркале с фронтом (TrackView/progressMs — camelCase).
    @get:JsonProperty("isPlaying") val isPlaying: Boolean,
    val progressMs: Long?,
    val track: TrackView?,
    val source: SourceRef?,
) {
    companion object {
        /** Тихое «ничего не играет» — единая форма для 204 и неподключённого слайса. */
        val IDLE = NowPlayingView(isPlaying = false, progressMs = null, track = null, source = null)
    }
}

/** Недавно сыгранный трек с меткой времени проигрывания (ISO-8601 из Spotify). */
@RegisterForReflection
data class RecentTrackView(
    val track: TrackView,
    val playedAt: String?,
)
