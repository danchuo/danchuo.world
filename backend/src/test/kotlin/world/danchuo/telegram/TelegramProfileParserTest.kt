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
    fun `собирает визитку из og-разметки страницы`() {
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
    fun `берёт og-теги, а не соседние twitter`() {
        val html = """<meta name="twitter:title" content="чужое"><meta property="og:title" content="Данила">"""
        assertEquals("Данила", TelegramProfileParser.parse(html, "danchuo")?.name)
    }

    /** An empty status is a legitimate account state: the card renders, just without that line. */
    @Test
    fun `аккаунт без статуса остаётся визиткой`() {
        val profile = TelegramProfileParser.parse(page(description = null), "danchuo")!!
        assertNull(profile.bio)
        assertEquals("Данила", profile.name)
    }

    /** There may be no avatar (an empty profile) — the name and handle already fill the card. */
    @Test
    fun `аккаунт без аватара остаётся визиткой`() {
        assertNull(TelegramProfileParser.parse(page(image = null), "danchuo")?.avatarUrl)
    }

    /**
     * The handle is absent from the OG markup, so it comes from the page body. If that moves too,
     * the handle we navigated by is certainly right — the page was served for it.
     */
    @Test
    fun `ник без собаки, а при поехавшей вёрстке — тот, по которому ходили`() {
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = "@danchuo"), "danchuo")?.username)
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = null), "danchuo")?.username)
    }

    /** The name arrives escaped — the card must show the real characters. */
    @Test
    fun `разэкранирует html-сущности в имени и статусе`() {
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
    fun `страница без имени не даёт визитки вовсе`() {
        assertNull(TelegramProfileParser.parse("<html><body>Telegram</body></html>", "danchuo"))
        assertNull(TelegramProfileParser.parse(page(title = "   "), "danchuo"))
    }
}
