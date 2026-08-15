package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Поиск выпуска в чужом RSS (PRD §5.16.1) — единственное место, где мы знаем формат подкастного
 * фида.
 *
 * **Главный риск всей затеи — не «не нашли», а «нашли не тот».** Пропущенный выпуск стоит
 * отсутствующей кнопки; чужой — уверенного пересказа под карточкой, и отличить его на странице
 * будет нечем. Поэтому ключей два: название И длительность, и при сомнении мы молчим.
 *
 * Формы взяты из живых фидов (разведка по фонотеке владельца):
 * - `&#038;` у Lex Fridman и `&amp;` у Huberman — на этом промахнулся первый же скрипт разведки,
 *   принявший «amp» за слово названия;
 * - хвост « | Dr. Fei-Fei Li» у Huberman и « | Better in Person» у Freakonomics: в Spotify
 *   название выпуска короче, чем в фиде;
 * - `itunes:duration` бывает и «01:25:37», и голыми секундами «7707»;
 * - у Huberman длительность разошлась со Spotify на 14 с (динамическая вставка рекламы) —
 *   поэтому допуск в долях, а не «пара секунд».
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
        // В Spotify выпуск называется короче: фид дописывает к нему гостя через « | ».
        val found = PodcastFeedParser.enclosureFor(
            feed,
            "Using AI to Increase Your Intelligence & Enrich Humanity",
            7_692_501,
        )

        // Сущности в ссылке раскрыты — иначе `&amp;` уехал бы в query как есть и раздача
        // отдала бы 404 на параметр с именем «amp;awEpisodeId».
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
        // Название совпало, а длительность разошлась вдвое — это другой выпуск (переиздание,
        // тизер, тёзка в чужом фиде). Молчим: чужой пересказ хуже отсутствующего.
        assertNull(PodcastFeedParser.enclosureFor(feed, "How Feelings Make Us Smarter", 5_800_000))
    }

    @Test
    fun `a few seconds of injected ads do not lose the episode`() {
        // Huberman: 7707 с в фиде против 7692.5 с в Spotify — динамическая реклама. Допуск в
        // долях это переживает, «пара секунд» — нет.
        val found = PodcastFeedParser.enclosureFor(
            feed,
            "Using AI to Increase Your Intelligence & Enrich Humanity | Dr. Fei-Fei Li",
            7_692_501,
        )

        assertEquals("https://cdn.example/ai.mp3?aid=rss_feed&awEpisodeId=42", found)
    }

    @Test
    fun `a feed without durations still yields an exactly named episode`() {
        // Фид Lex Fridman не несёт длительности вовсе (замерено: ни itunes:duration, ни любого
        // другого тега; length в enclosure — заглушка 5 МБ против настоящих 143 МБ). Отказ по
        // «нет второго ключа» стоил бы всего шоу целиком, поэтому при отсутствии длительности
        // требуется ТОЧНОЕ совпадение названия — приблизительного мало.
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
        // Приблизительного совпадения без длительности не хватает: это мог бы быть тизер или
        // «часть 2» того же разговора.
        assertNull(PodcastFeedParser.enclosureFor(lex, "#500", 11_971_328))
    }

    @Test
    fun `two episodes with the same name and no duration are an ambiguity, not a match`() {
        // Переиздание под тем же названием: сверить не с чем, и выбрать наугад хуже, чем молчать.
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
        // Длительность не приехала с плеера — остаётся один ключ из двух, и этого мало:
        // ошибиться выпуском страшнее, чем не показать кнопку.
        assertNull(PodcastFeedParser.enclosureFor(feed, "How Feelings Make Us Smarter", null))
    }

    @Test
    fun `the feed of a show is found by its own title`() {
        val results = listOf(
            ItunesShow(collectionName = "Hidden Brain Plus", feedUrl = "https://example/plus.xml"),
            ItunesShow(collectionName = "Hidden Brain", feedUrl = "https://feeds.simplecast.com/kwWc0lhf"),
        )

        // Точное совпадение важнее порядка выдачи: «Hidden Brain Plus» стоит первым и это
        // ДРУГОЕ шоу — у него свои выпуски, и пересказ поехал бы из чужого фида.
        assertEquals("https://feeds.simplecast.com/kwWc0lhf", PodcastFeedParser.feedUrlFor(results, "Hidden Brain"))
        assertNull(PodcastFeedParser.feedUrlFor(results, "Совсем другое шоу"))
        assertNull(PodcastFeedParser.feedUrlFor(emptyList(), "Hidden Brain"))
        // Запись без фида бесполезна: качать нечего.
        assertNull(PodcastFeedParser.feedUrlFor(listOf(ItunesShow("Hidden Brain", null)), "Hidden Brain"))
    }
}
