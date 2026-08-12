package world.danchuo.spotify

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals

import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Разбор ответа `currently-playing` (PRD §5.6). Поле `item` — СОЮЗ трека и эпизода, и половины
 * у них разные: у эпизода нет ни `artists`, ни `album`, у трека нет ни `show`, ни собственных
 * `images`. Отсутствующее поле обязано читаться как пустота, а не ронять разбор.
 *
 * Тест написан по следам живой поломки: поллер честно дождался эпизода и упал на
 * `Parameter specified as non-null is null: SpotifyTrack.<init>, parameter artists` — Jackson не
 * подставил котлиновский дефолт для ОТСУТСТВУЮЩЕГО поля, а передал null в non-null параметр.
 * Проверки на живых объектах этого поймать не могли: до конструктора DTO они не доходят.
 *
 * Маппер берём тот же, что у REST-клиента (инъекцией), — собственноручно собранный проверял бы
 * не ту конфигурацию, в которой поломка и случилась.
 */
class SpotifyCurrentlyPlayingDeserializationTest {

    /**
     * ГОЛЫЙ маппер, без котлиновского модуля, — намеренно самая строгая конфигурация.
     * Инъекция CDI-маппера этот тест проходила: он дефолты применяет, а маппер REST-клиента,
     * на котором поллер и упал, — нет. DTO обязаны разбираться при любом из них.
     */
    private val mapper = ObjectMapper()

    /** Сокращённый, но дословный ответ Spotify: играет эпизод подкаста. */
    private val episodePayload = """
        {
          "is_playing": true,
          "timestamp": 1786538888068,
          "context": {
            "external_urls": { "spotify": "https://open.spotify.com/show/20Gf4IAauFrfj7RBkjcWxh" },
            "type": "show",
            "uri": "spotify:show:20Gf4IAauFrfj7RBkjcWxh"
          },
          "progress_ms": 1884572,
          "item": {
            "description": "Some people are remarkably good at reading the room.",
            "duration_ms": 2887209,
            "external_urls": { "spotify": "https://open.spotify.com/episode/6wKTmlx7n4NW3SakLdsrJL" },
            "id": "6wKTmlx7n4NW3SakLdsrJL",
            "images": [
              { "height": 640, "url": "https://i.scdn.co/image/big.jpg", "width": 640 },
              { "height": 300, "url": "https://i.scdn.co/image/mid.jpg", "width": 300 },
              { "height": 64, "url": "https://i.scdn.co/image/small.jpg", "width": 64 }
            ],
            "is_playable": true,
            "language": "en",
            "name": "How Feelings Make Us Smarter",
            "release_date": "2026-08-10",
            "show": {
              "external_urls": { "spotify": "https://open.spotify.com/show/20Gf4IAauFrfj7RBkjcWxh" },
              "id": "20Gf4IAauFrfj7RBkjcWxh",
              "media_type": "audio",
              "name": "Hidden Brain",
              "total_episodes": 716,
              "type": "show",
              "uri": "spotify:show:20Gf4IAauFrfj7RBkjcWxh"
            },
            "type": "episode",
            "uri": "spotify:episode:6wKTmlx7n4NW3SakLdsrJL"
          },
          "currently_playing_type": "episode"
        }
    """.trimIndent()

    /** Тот же эндпоинт, но играет музыка: теперь пусты `show` и `images`, а не `artists`. */
    private val trackPayload = """
        {
          "is_playing": true,
          "progress_ms": 61000,
          "item": {
            "id": "4cOdK2wGLETKBW3PvgPWqT",
            "type": "track",
            "name": "Never Gonna Give You Up",
            "duration_ms": 213573,
            "external_urls": { "spotify": "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT" },
            "artists": [ { "name": "Rick Astley", "external_urls": { "spotify": "https://x" } } ],
            "album": {
              "name": "Whenever You Need Somebody",
              "album_type": "album",
              "images": [ { "height": 640, "url": "https://i.scdn.co/image/cover.jpg", "width": 640 } ]
            }
          },
          "currently_playing_type": "track"
        }
    """.trimIndent()

    @Test
    fun `an episode parses even though it carries no artists and no album`() {
        val parsed = mapper.readValue(episodePayload, SpotifyCurrentlyPlaying::class.java)

        assertEquals("episode", parsed.currentlyPlayingType)
        assertEquals(1_884_572L, parsed.progressMs)

        val item = requireNotNull(parsed.item)
        assertEquals("6wKTmlx7n4NW3SakLdsrJL", item.id)
        assertEquals("How Feelings Make Us Smarter", item.name)
        assertEquals(2_887_209L, item.durationMs)
        assertEquals(
            "https://open.spotify.com/episode/6wKTmlx7n4NW3SakLdsrJL",
            item.externalUrls?.spotify,
        )
        // Пустые половины союза — именно пустые, а не причина упасть.
        assertTrue(item.artists.isNullOrEmpty())
        assertNull(item.album)

        val show = requireNotNull(item.show)
        assertEquals("Hidden Brain", show.name)
        assertEquals("https://open.spotify.com/show/20Gf4IAauFrfj7RBkjcWxh", show.externalUrls?.spotify)
        assertEquals(3, item.images?.size)
    }

    @Test
    fun `a track still parses and keeps its own half of the union`() {
        val parsed = mapper.readValue(trackPayload, SpotifyCurrentlyPlaying::class.java)

        val item = requireNotNull(parsed.item)
        assertEquals("Rick Astley", item.artists?.firstOrNull()?.name)
        assertEquals("Whenever You Need Somebody", item.album?.name)
        // У трека нет ни шоу, ни собственных картинок — обложка живёт в альбоме.
        assertNull(item.show)
        assertTrue(item.images.isNullOrEmpty())
    }

    @Test
    fun `nothing playing is a body-less 204, not an empty object`() {
        // Формой ответа это не проверить — 204 приходит без тела и клиент отдаёт null.
        // Здесь фиксируем соседний случай: пустой объект не должен ронять разбор.
        val parsed = mapper.readValue("{}", SpotifyCurrentlyPlaying::class.java)

        assertNull(parsed.item)
        assertNull(parsed.currentlyPlayingType)
    }
}
