package world.danchuo.telegram

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Parsing the public `t.me/{username}` page (PRD §5.18). The channel is HTML, not an API: the
 * card page serves name, status and avatar to an anonymous visitor, like GitHub's contribution
 * fragment. We read the OG tags, which change less often than the page's own classes.
 */

/**
 * The degradation contract matches contributions: what we do not understand we do not return.
 * A `null` means "nothing to show" and the card simply does not appear, rather than a plausible
 * profile with an empty name.
 */
class TelegramProfileParserTest {

    /** The live `t.me/danchuo` page taken on 2026-09-14 — only what the parser reads. */
    private fun page(
        title: String = "Данила",
        description: String? = "keep",
        image: String? = "https://cdn4.telesco.pe/file/A-bM.jpg",
        extra: String? = "@danchuo",
    ) = buildString {
        append("""<meta property="og:title" content="$title">""")
        append("""<meta property="og:site_name" content="Telegram">""")
        if (description != null) append("""<meta property="og:description" content="$description">""")
        if (image != null) append("""<meta property="og:image" content="$image">""")
        append("""<meta name="twitter:title" content="не отсюда">""")
        append("""<div class="tgme_page_title"><span dir="auto">$title</span></div>""")
        if (extra != null) append("""<div class="tgme_page_extra">\n  $extra\n</div>""")
    }

    @Test
    fun `builds the card from the page's og markup`() {
        val profile = TelegramProfileParser.parse(page(), fallbackUsername = "danchuo")!!

        assertEquals("Данила", profile.name)
        assertEquals("danchuo", profile.username)
        assertEquals("keep", profile.bio)
        assertEquals("https://cdn4.telesco.pe/file/A-bM.jpg", profile.avatarUrl)
    }

    /**
     * `og:title` and `twitter:title` sit side by side carrying the same thing; we take og, or the
     * order of tags on the page would decide whose value arrives.
     */
    @Test
    fun `takes the og tags, not the neighbouring twitter ones`() {
        val html = """<meta name="twitter:title" content="чужое"><meta property="og:title" content="Данила">"""
        assertEquals("Данила", TelegramProfileParser.parse(html, "danchuo")?.name)
    }

    /** An empty status is a legitimate account state: the card renders, just without that line. */
    @Test
    fun `an account without a status is still a card`() {
        val profile = TelegramProfileParser.parse(page(description = null), "danchuo")!!
        assertNull(profile.bio)
        assertEquals("Данила", profile.name)
    }

    @Test
    fun `Telegram's boilerplate description does not stand in for a missing status`() {
        val profile = TelegramProfileParser.parse(
            page(description = "You can contact @danchuo right away."),
            "danchuo",
        )!!
        assertNull(profile.bio)
    }

    /** There may be no avatar (an empty profile) — the name and handle already fill the card. */
    @Test
    fun `an account without an avatar is still a card`() {
        assertNull(TelegramProfileParser.parse(page(image = null), "danchuo")?.avatarUrl)
    }

    /**
     * The handle is absent from the OG markup, so it comes from the page body. If that moves too,
     * the handle we navigated by is certainly right — the page was served for it.
     */
    @Test
    fun `the nickname without the at sign, and with broken markup the one that was requested`() {
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = "@danchuo"), "danchuo")?.username)
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = null), "danchuo")?.username)
    }

    /** The name arrives escaped — the card must show the real characters. */
    @Test
    fun `unescapes html entities in the name and status`() {
        val profile = TelegramProfileParser.parse(
            page(title = "Дан &amp; Ко", description = "&quot;keep&quot; &lt;3"),
            "danchuo",
        )!!
        assertEquals("Дан & Ко", profile.name)
        assertEquals("\"keep\" <3", profile.bio)
    }

    /**
     * A non-existent handle returns a stub page with no `og:title`, and so does any other channel
     * failure: an error page, a redirect, moved markup.
     */
    @Test
    fun `a page without a name gives no card at all`() {
        assertNull(TelegramProfileParser.parse("<html><body>Telegram</body></html>", "danchuo"))
        assertNull(TelegramProfileParser.parse(page(title = "   "), "danchuo"))
    }
}
