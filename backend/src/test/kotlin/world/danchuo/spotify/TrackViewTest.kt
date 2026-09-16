package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Squeezing `item` into the "now playing" tile projection. A podcast is as valid an answer as a
 * track, so an episode fits the same shape with no new fields: the "artist" is the show with its
 * own link, the cover is the episode's own (a track's lives on the album), and there is no album.
 */
class TrackViewTest {

    private val cover = listOf(
        SpotifyImage("https://i.scdn.co/image/big.jpg", 640, 640),
        SpotifyImage("https://i.scdn.co/image/mid.jpg", 300, 300),
    )

    @Test
    fun `an episode becomes a track view whose artist is the show`() {
        val view = TrackView.from(
            SpotifyTrack(
                id = "6wKTmlx7n4NW3SakLdsrJL",
                type = "episode",
                name = "How Feelings Make Us Smarter",
                durationMs = 2_887_209,
                externalUrls = SpotifyExternalUrls("https://open.spotify.com/episode/6wKTmlx7n4NW3SakLdsrJL"),
                images = cover,
                show = SpotifyShow(
                    id = "20Gf4IAauFrfj7RBkjcWxh",
                    name = "Hidden Brain",
                    externalUrls = SpotifyExternalUrls("https://open.spotify.com/show/20Gf4IAauFrfj7RBkjcWxh"),
                ),
            ),
        )

        val track = requireNotNull(view)
        assertEquals("How Feelings Make Us Smarter", track.title)
        assertEquals(listOf("Hidden Brain"), track.artists.map { it.name })
        assertEquals("https://open.spotify.com/show/20Gf4IAauFrfj7RBkjcWxh", track.artists.single().url)
        // An episode's cover sits on the episode itself, and we take the largest, as for an album.
        assertEquals("https://i.scdn.co/image/big.jpg", track.albumImageUrl)
        // An episode has no album; the tile simply does not draw that line.
        assertNull(track.album)
        assertEquals(2_887_209L, track.durationMs)
    }

    @Test
    fun `an episode without a cover of its own falls back to the show artwork`() {
        val view = TrackView.from(
            SpotifyTrack(
                type = "episode",
                name = "Без обложки",
                show = SpotifyShow(name = "Hidden Brain", images = cover),
            ),
        )

        assertEquals("https://i.scdn.co/image/big.jpg", requireNotNull(view).albumImageUrl)
    }

    @Test
    fun `a track is unaffected and keeps artists and album`() {
        val view = TrackView.from(
            SpotifyTrack(
                type = "track",
                name = "Never Gonna Give You Up",
                artists = listOf(SpotifyArtist("Rick Astley", SpotifyExternalUrls("https://x"))),
                album = SpotifyAlbum("Whenever You Need Somebody", "album", cover),
            ),
        )

        val track = requireNotNull(view)
        assertEquals(listOf("Rick Astley"), track.artists.map { it.name })
        assertEquals("Whenever You Need Somebody", track.album?.name)
        assertEquals("https://i.scdn.co/image/big.jpg", track.albumImageUrl)
    }

    @Test
    fun `nothing playing stays null`() {
        assertNull(TrackView.from(null))
        assertNull(TrackView.from(SpotifyTrack(name = "   ")))
    }
}
