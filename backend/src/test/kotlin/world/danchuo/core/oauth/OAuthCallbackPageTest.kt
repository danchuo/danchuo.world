package world.danchuo.core.oauth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The callback page is served as HTML on the site's OWN origin, and part of its text arrives in a
 * query parameter the provider redirects with. Anything a stranger can put in that parameter must
 * come out as letters. PRD §3
 */
class OAuthCallbackPageTest {

    @Test
    fun `markup in the message comes out as text`() {
        val html = OAuthCallbackPage.html("Spotify", "отказал: <script>alert(1)</script>")

        assertFalse(html.contains("<script>"), "a tag from the message reached the page: $html")
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"), html)
    }

    @Test
    fun `the quote and the ampersand are escaped too`() {
        val html = OAuthCallbackPage.html("Spotify", """a & b " c ' d""")

        assertTrue(html.contains("a &amp; b &quot; c &#39; d"), html)
    }

    @Test
    fun `the provider's error code is cut to a diagnostic`() {
        val long = "e".repeat(OAuthCallbackPage.MAX_DETAIL * 3)

        assertEquals(OAuthCallbackPage.MAX_DETAIL, OAuthCallbackPage.detail(long).length)
    }

    @Test
    fun `a short error code survives whole`() {
        assertEquals("access_denied", OAuthCallbackPage.detail("access_denied"))
    }

    @Test
    fun `the page still says which provider and what happened`() {
        val html = OAuthCallbackPage.html("Instagram", "подключён")

        assertTrue(html.contains("Instagram"), html)
        assertTrue(html.contains("подключён"), html)
        assertTrue(html.startsWith("<!doctype html>"), html)
    }
}
