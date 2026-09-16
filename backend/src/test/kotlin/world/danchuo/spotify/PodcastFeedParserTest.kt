package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Finding an episode in a foreign RSS feed (PRD §5.16.1). The real risk is not "not found" but
 * "found the wrong one": a missing episode costs a button, a foreign one costs a confident
 * retelling under the card. Two keys then — title AND duration — and silence when in doubt.
 */

/**
 * The shapes come from live feeds: `&#038;` and `&amp;` in titles, a guest appended after " | "
 * where Spotify's title is shorter, `itunes:duration` either "01:25:37" or bare seconds, and a
 * 14-second drift against Spotify from dynamic ads — hence a tolerance in fractions.
 */
class PodcastFeedParserTest {

    private val feed = """
        <rss><channel>
          <item>
            <title>Essentials: How to Optimize Female Hormone Health</title>
            <enclosure url="https://cdn.example/other.mp3" type="audio/mpeg"/>
            <itunes:duration>1800</itunes:duration>
          </item>
          <item>
            <title>Using AI to Increase Your Intelligence &amp; Enrich Humanity | Dr. Fei-Fei Li</title>
            <enclosure url="https://cdn.example/ai.mp3?aid=rss_feed&amp;awEpisodeId=42" type="audio/mpeg"/>
            <itunes:duration>7707</itunes:duration>
          </item>
          <item>
            <title>How Feelings Make Us Smarter</title>
            <enclosure url="https://cdn.example/feelings.mp3" type="audio/mpeg"/>
            <itunes:duration>00:48:07</itunes:duration>
          </item>
        </channel></rss>
    """.trimIndent()

    @Test
    fun `an episode is found by its exact title`() {
        val found = PodcastFeedParser.enclosureFor(feed, "How Feelings Make Us Smarter", 2_887_209)

        assertEquals("https://cdn.example/feelings.mp3", found)
    }

    @Test
    fun `the feed may carry a longer title than the player does`() {
        // Spotify's title is shorter: the feed appends the guest after " | ".
        val found = PodcastFeedParser.enclosureFor(
            feed,
            "Using AI to Increase Your Intelligence & Enrich Humanity",
            7_692_501,
        )

        // Entities in the link are resolved, or `&amp;` travels into the query as is and the CDN
        // 404s on a parameter literally named "amp;awEpisodeId".
        assertEquals("https://cdn.example/ai.mp3?aid=rss_feed&awEpisodeId=42", found)
    }

    @Test
    fun `duration is read in both shapes the feeds use`() {
        assertEquals(7707, PodcastFeedParser.durationSeconds("7707"))
        assertEquals(2887, PodcastFeedParser.durationSeconds("00:48:07"))
        assertEquals(2887, PodcastFeedParser.durationSeconds("48:07"))
        assertNull(PodcastFeedParser.durationSeconds("совсем не время"))
        assertNull(PodcastFeedParser.durationSeconds(null))
    }

    @Test
    fun `an episode whose length disagrees is not our episode`() {
        // Title matches, duration is off by half — a different episode (a re-release, a teaser, a
        // namesake in another feed). Stay silent: a foreign retelling is worse than none.
        assertNull(PodcastFeedParser.enclosureFor(feed, "How Feelings Make Us Smarter", 5_800_000))
    }

    @Test
    fun `a few seconds of injected ads do not lose the episode`() {
        // Dynamic ad insertion drifts the feed's duration against Spotify's; a fractional
        // tolerance survives that, "a couple of seconds" does not.
        val found = PodcastFeedParser.enclosureFor(
            feed,
            "Using AI to Increase Your Intelligence & Enrich Humanity | Dr. Fei-Fei Li",
            7_692_501,
        )

        assertEquals("https://cdn.example/ai.mp3?aid=rss_feed&awEpisodeId=42", found)
    }

    @Test
    fun `a feed without durations still yields an exactly named episode`() {
        // Some feeds carry no duration at all (measured: no `itunes:duration`, and enclosure
        // `length` is a 5 MB placeholder). Refusing for "no second key" would cost the whole
        // show, so with no duration the title must match EXACTLY.
        val lex = """
            <rss><channel><item>
              <title>#500 &#8211; Khabib Nurmagomedov: Dagestan, MMA &#038; Football</title>
              <enclosure url="https://media.example/khabib.mp3" length="5242880" type="audio/mpeg"/>
            </item></channel></rss>
        """.trimIndent()

        assertEquals(
            "https://media.example/khabib.mp3",
            PodcastFeedParser.enclosureFor(lex, "#500 - Khabib Nurmagomedov: Dagestan, MMA & Football", 11_971_328),
        )
        // An approximate match with no duration is not enough: this could be a teaser or a part 2.
        assertNull(PodcastFeedParser.enclosureFor(lex, "#500", 11_971_328))
    }

    @Test
    fun `two episodes with the same name and no duration are an ambiguity, not a match`() {
        // A re-release under the same title: nothing to check against, and guessing beats silence.
        val twins = """
            <rss><channel>
              <item><title>Один и тот же выпуск</title>
                <enclosure url="https://media.example/a.mp3" type="audio/mpeg"/></item>
              <item><title>Один и тот же выпуск</title>
                <enclosure url="https://media.example/b.mp3" type="audio/mpeg"/></item>
            </channel></rss>
        """.trimIndent()

        assertNull(PodcastFeedParser.enclosureFor(twins, "Один и тот же выпуск", 1_000_000))
    }

    @Test
    fun `an episode that is not in the feed is a quiet null`() {
        assertNull(PodcastFeedParser.enclosureFor(feed, "Выпуск, которого тут нет", 1_000_000))
        assertNull(PodcastFeedParser.enclosureFor("не rss вовсе", "How Feelings Make Us Smarter", 2_887_209))
    }

    @Test
    fun `without a known length we do not guess`() {
        // The player gave no duration, leaving one key of two — not enough: the wrong episode
        // is scarier than a missing button.
        assertNull(PodcastFeedParser.enclosureFor(feed, "How Feelings Make Us Smarter", null))
    }

    @Test
    fun `the feed of a show is found by its own title`() {
        val results = listOf(
            ItunesShow(collectionName = "Hidden Brain Plus", feedUrl = "https://example/plus.xml"),
            ItunesShow(collectionName = "Hidden Brain", feedUrl = "https://feeds.simplecast.com/kwWc0lhf"),
        )

        // An exact match beats result order: the "… Plus" show listed first is a DIFFERENT show
        // with its own episodes, and the retelling would come from a foreign feed.
        assertEquals("https://feeds.simplecast.com/kwWc0lhf", PodcastFeedParser.feedUrlFor(results, "Hidden Brain"))
        assertNull(PodcastFeedParser.feedUrlFor(results, "Совсем другое шоу"))
        assertNull(PodcastFeedParser.feedUrlFor(emptyList(), "Hidden Brain"))
        // An entry without a feed is useless: there is nothing to download.
        assertNull(PodcastFeedParser.feedUrlFor(listOf(ItunesShow("Hidden Brain", null)), "Hidden Brain"))
    }
}
