package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Public read projections of the music layer — what `GET /api/spotify/…` returns and the music
 * tile renders. Spotify's rich answer is squeezed to the needed minimum, but the attribution link
 * back to the track survives in [TrackView.url].
 */

/** An artist with an attribution link to their Spotify page. */
// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).
@RegisterForReflection
data class ArtistRef(
    val name: String,
    /** Link to the artist on Spotify, `null` when it did not arrive. */
    val url: String?,
)

/** An album with an attribution link to its Spotify page. */
@RegisterForReflection
data class AlbumRef(
    val name: String,
    /** Link to the album on Spotify, `null` when it did not arrive. */
    val url: String?,
)

/** One track in human-readable form. */
@RegisterForReflection
data class TrackView(
    val title: String,
    /** Performers (Spotify returns a list); each with its own link. */
    val artists: List<ArtistRef>,
    /** Album; `null` for singles and same-named releases (we do not repeat the track title). */
    val album: AlbumRef?,
    /** Album cover (the largest one served), `null` when there is none. */
    val albumImageUrl: String?,
    /** Link to the track on Spotify (attribution), `null` when it did not arrive. */
    val url: String?,
    val durationMs: Long?,
) {
    companion object {
        /** Folds a raw [SpotifyTrack] into the projection; `null` when there is no track at all. */
        fun from(track: SpotifyTrack?): TrackView? {
            val title = track?.name?.takeIf { it.isNotBlank() } ?: return null

            // A podcast episode fits this same shape without a single new field: the "performer"
            // is the show (with its own link), the episode carries its own cover, and there is no
            // album. The tile already knows how to stay silent about a missing album.
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
            // The album is hidden for a single, or when its name equals the track title — a
            // same-named release would only duplicate it.
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
                // Take the largest cover (Spotify sorts descending, but do not rely on it).
                albumImageUrl = album?.images.largest(),
                url = track.externalUrls?.spotify,
                durationMs = track.durationMs,
            )
        }
    }
}

/** The largest cover served; Spotify sorts descending, but we do not rely on it. */
private fun List<SpotifyImage>?.largest(): String? =
    orEmpty().maxByOrNull { (it.width ?: 0) * (it.height ?: 0) }?.url

/**
 * Playback source (PRD §M3): where the track plays from. An album does NOT go here — it is
 * already shown by the album line ([TrackView.album]); the source is about a playlist, artist,
 * podcast or liked songs. `null` when there is no context, or it has no link.
 */
@RegisterForReflection
data class SourceRef(
    /** Spotify context type: `playlist` / `artist` / `collection` / `show`. */
    val type: String,
    /** Link to the source on Spotify. */
    val url: String,
    /** Source name (playlist or artist). `null` when it could not be fetched — the board shows the type. */
    val name: String?,
) {
    companion object {
        /** The basic form ([type]+[url]) without a name; [SpotifyService] resolves it separately. */
        fun from(context: SpotifyContext?): SourceRef? {
            val type = context?.type?.takeIf { it.isNotBlank() } ?: return null
            // The album already shows on its own line — do not duplicate it as the source.
            if (type.equals("album", ignoreCase = true)) return null
            val url = context.externalUrls?.spotify?.takeIf { it.isNotBlank() } ?: return null
            return SourceRef(type, url, name = null)
        }
    }
}

/**
 * The "now playing" state. [track] `null` means nothing is playing (or nothing is connected), and
 * the board draws a quiet empty state with no special branch. [source] is where it plays from,
 * `null` for an album and for "outside a context".
 */
@RegisterForReflection
data class NowPlayingView(
    // Without an explicit name Jackson would strip the boolean `is` prefix into a "playing" field;
    // the `isPlaying` contract mirrors the frontend (TrackView/progressMs are camelCase).
    @get:JsonProperty("isPlaying") val isPlaying: Boolean,
    val progressMs: Long?,
    val track: TrackView?,
    val source: SourceRef?,
) {
    companion object {
        /** A quiet "nothing is playing" — one shape for both a 204 and an unconnected slice. */
        val IDLE = NowPlayingView(isPlaying = false, progressMs = null, track = null, source = null)
    }
}

/** A recently played track with its play timestamp (ISO-8601 from Spotify). */
@RegisterForReflection
data class RecentTrackView(
    val track: TrackView,
    val playedAt: String?,
)
