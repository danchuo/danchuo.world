package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Сжатие поля `item` в проекцию плитки «сейчас играет» (PRD §M3). Плитка отвечает на вопрос
 * «что играет прямо сейчас», и подкаст — такой же ответ, как трек, поэтому эпизод укладывается
 * в ту же форму без единого нового поля: «исполнитель» — это шоу со своей ссылкой, обложка у
 * эпизода собственная (у трека она в альбоме), альбома нет вовсе.
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
        // Обложка эпизода лежит на нём самом, и берём крупнейшую — как у альбома.
        assertEquals("https://i.scdn.co/image/big.jpg", track.albumImageUrl)
        // Альбома у эпизода нет; плитка эту строку просто не рисует.
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
