package world.danchuo.spotify

/**
 * Parses foreign podcast RSS and catalogue output with regexes, not an XML parser — feeds in the
 * wild are invalid just enough that a strict parser refuses everything. THE RISK IS NOT "not
 * found" BUT "found the wrong one", so there are two keys and any doubt means silence. §5.16.1
 */
object PodcastFeedParser {

    /**
     * Allowed duration mismatch, as a fraction. Two percent: a show with dynamic ad insertion
     * simply never matches between feed and Spotify, while an episode off by a factor of two is
     * a different episode.
     */
    const val DURATION_TOLERANCE = 0.02

    /**
     * A show's feed by the player's name for it. An EXACT match is sought first and only then an
     * approximate one: popular shows have same-named companions ("Hidden Brain Plus") that rank
     * higher in results and contain DIFFERENT episodes.
     */
    fun feedUrlFor(results: List<ItunesShow>, showName: String): String? {
        val wanted = normalise(showName)
        if (wanted.isEmpty()) return null
        val withFeed = results.filter { !it.feedUrl.isNullOrBlank() }
        return (
            withFeed.firstOrNull { normalise(it.collectionName) == wanted }
                ?: withFeed.firstOrNull { normalise(it.collectionName).startsWith(wanted) }
            )?.feedUrl
    }

    /**
     * Audio link for [episodeName] of [durationMs]; `null` means not found OR not certain. With a
     * duration, the name is matched from both sides and the duration must agree; with a feed that
     * carries no duration at all, an EXACT and unique name is required instead. PRD §5.16.1
     */
    fun enclosureFor(xml: String, episodeName: String, durationMs: Long?): String? {
        if (durationMs == null || durationMs <= 0) return null
        val wanted = normalise(episodeName)
        if (wanted.isEmpty()) return null

        val exact = mutableListOf<String>()
        for (item in items(xml)) {
            val title = normalise(entities(tag(item, "title") ?: continue))
            val sameName = title == wanted
            if (!sameName && !title.startsWith(wanted) && !wanted.startsWith(title)) continue

            val url = attribute(item, ENCLOSURE, "url")?.let(::entities)?.takeIf { it.isNotBlank() }
                ?: continue

            val seconds = durationSeconds(tag(item, "itunes:duration"))
            if (seconds == null) {
                // With no duration the episode only qualifies on an exact name, and we decide
                // after the walk: a same-named twin must cancel the find, not lose to ordering.
                if (sameName) exact += url
                continue
            }

            val drift = kotlin.math.abs(seconds * 1000.0 - durationMs) / durationMs
            if (drift <= DURATION_TOLERANCE) return url
        }
        return exact.singleOrNull()
    }

    /** `itunes:duration` comes as bare seconds ("7707") or as clock time ("01:25:37", "48:07"). */
    fun durationSeconds(raw: String?): Int? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return null
        if (!text.contains(':')) return text.toIntOrNull()?.takeIf { it > 0 }

        val parts = text.split(':').map { it.trim().toIntOrNull() ?: return null }
        val seconds = when (parts.size) {
            2 -> parts[0] * 60 + parts[1]
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            else -> return null
        }
        return seconds.takeIf { it > 0 }
    }

    /** The `<item>...</item>` chunks — cut by string, not by a parser (see the class note). */
    private fun items(xml: String): List<String> =
        xml.split(ITEM_OPEN).drop(1).map { it.substringBefore("</item>") }

    private fun tag(item: String, name: String): String? =
        Regex("<$name[^>]*>([\\s\\S]*?)</$name>", RegexOption.IGNORE_CASE)
            .find(item)?.groupValues?.get(1)
            ?.replace(CDATA, "")?.trim()

    private fun attribute(item: String, tag: Regex, name: String): String? =
        tag.find(item)?.value?.let { Regex("""$name="([^"]*)"""", RegexOption.IGNORE_CASE).find(it) }
            ?.groupValues?.get(1)

    /**
     * A title reduced to a comparable form: letters and digits separated by single spaces.
     * Entities are expanded BEFORE this, which is not a detail — an unexpanded `&amp;` leaves the
     * word "amp" in the title and the episode stops being found.
     */
    private fun normalise(text: String?): String =
        text.orEmpty().lowercase().replace(NON_ALNUM, " ").trim().replace(SPACES, " ")

    /** Entities that actually occur in feeds; the numeric form covers the rest. */
    private fun entities(text: String): String =
        text.replace("&amp;", "&").replace("&quot;", "\"").replace("&apos;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
            .replace(NUMERIC_ENTITY) { m ->
                val code = m.groupValues[2].toIntOrNull(if (m.groupValues[1].isEmpty()) 10 else 16)
                code?.takeIf { it in 1..0x10FFFF }?.let { String(Character.toChars(it)) } ?: m.value
            }

    private val ITEM_OPEN = Regex("<item[\\s>]", RegexOption.IGNORE_CASE)
    private val ENCLOSURE = Regex("<enclosure[^>]*>", RegexOption.IGNORE_CASE)
    private val CDATA = Regex("""<!\[CDATA\[|]]>""")
    private val NUMERIC_ENTITY = Regex("""&#(x?)([0-9a-fA-F]+);""")
    private val NON_ALNUM = Regex("""[^\p{L}\p{N}]+""")
    private val SPACES = Regex("""\s+""")
}
