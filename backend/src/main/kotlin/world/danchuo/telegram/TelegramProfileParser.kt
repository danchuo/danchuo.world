package world.danchuo.telegram

/**
 * The owner's Telegram card, exactly what the board draws. [avatarUrl] is Telegram's CDN address,
 * not ours: downloading the bytes and swapping the address is done a layer up, while parsing owes
 * only what the page actually says. PRD §5.18
 */
data class TelegramProfile(
    val name: String,
    val username: String,
    val bio: String?,
    val avatarUrl: String?,
)

/**
 * Parses the public `t.me/{username}` page — a pure function holding all the channel's fragility.
 * It reads the OG PREVIEW TAGS rather than the markup, since those exist for other people's
 * previews and change more rarely than classes. Why HTML and not an API: PRD §5.18.
 */
object TelegramProfileParser {

    private val META = Regex("""<meta\b[^>]*>""")
    private val PROPERTY = Regex("""\bproperty="([^"]+)"""")
    private val CONTENT = Regex("""\bcontent="([^"]*)"""")
    private val EXTRA = Regex("""<div\s+class="tgme_page_extra"\s*>([^<]*)</div>""")

    /**
     * Page html to a card. [fallbackUsername] is the name it was requested by, which covers the
     * hole if `tgme_page_extra` ever moves.
     */
    fun parse(html: String, fallbackUsername: String): TelegramProfile? {
        val og = ogTags(html)
        val name = og["og:title"]?.let(::unescape)?.trim().orEmpty()
        if (name.isEmpty()) return null
        val username = username(html) ?: fallbackUsername.trim().removePrefix("@")
        val description = og["og:description"]?.let(::unescape)?.trim()?.takeIf { it.isNotEmpty() }

        return TelegramProfile(
            name = name,
            username = username,
            bio = description?.takeUnless { it == "You can contact @$username right away." },
            avatarUrl = og["og:image"]?.let(::unescape)?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    /** `property -> content` over every `<meta>`; tags missing either attribute are skipped. */
    private fun ogTags(html: String): Map<String, String> {
        val tags = HashMap<String, String>()
        for (tag in META.findAll(html)) {
            val property = PROPERTY.find(tag.value)?.groupValues?.get(1) ?: continue
            val content = CONTENT.find(tag.value)?.groupValues?.get(1) ?: continue
            tags.putIfAbsent(property, content)
        }
        return tags
    }

    /** `@danchuo` from the markup to `danchuo`. Empty or not found gives `null` to the caller. */
    private fun username(html: String): String? =
        EXTRA.find(html)?.groupValues?.get(1)
            ?.replace("\n", " ")
            ?.trim()
            ?.takeIf { it.startsWith("@") }
            ?.removePrefix("@")
            ?.takeIf { it.isNotEmpty() }

    /**
     * Reverses the five entities Telegram escapes attribute values with. A full HTML table is not
     * needed: a name carrying a rare entity is better shown as is than allowed to drag the whole
     * parse down with it.
     */
    private fun unescape(value: String): String = value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}
