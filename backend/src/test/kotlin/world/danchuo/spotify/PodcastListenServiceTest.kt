package world.danchuo.spotify

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import java.time.Instant
import java.time.LocalDate

/**
 * Stitching player samples into sessions and deriving the item's mark (PRD §5.6). The pure
 * arithmetic lives in [PodcastListenMathTest] and [PodcastDayRollupTest]; here is what needs a
 * DB. The date is this class's own and everything written is removed in [cleanup].
 */
@QuarkusTest
class PodcastListenServiceTest {

    @Inject
    lateinit var service: PodcastListenService

    @Inject
    lateinit var sessions: PodcastSessionRepository

    @Inject
    lateinit var checklistItems: ChecklistItemRepository

    @Inject
    lateinit var checklistEntries: ChecklistEntryRepository

    /** Our own date: neighbours seed days from fixtures and must not see these sessions. */
    private val date: LocalDate = LocalDate.of(2026, 3, 3)
    private val start: Instant = Instant.parse("2026-03-03T05:00:00Z")

    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run {
            sessions.delete("date", date)
            val podcasts = checklistItems.findByKey(PODCAST_KEY)
            if (podcasts != null) {
                checklistEntries.delete("date = ?1 and itemId = ?2", date, podcasts.id!!)
            }
        }
    }

    private fun sample(episodeId: String, progressMinutes: Long) = EpisodeSample(
        episodeId = episodeId,
        progressMs = progressMinutes * 60_000,
        episodeName = "эпизод $episodeId",
        episodeUrl = "https://open.spotify.com/episode/$episodeId",
        showId = "show-$episodeId",
        showName = "шоу $episodeId",
        showUrl = "https://open.spotify.com/show/$episodeId",
        imageUrl = null,
        episodeDurationMs = 60L * 60_000,
    )

    /** Listen for [minutes] in 10-minute steps — inside the gap threshold, so one session. */
    private fun listen(episodeId: String, minutes: Long, from: Instant): Instant {
        service.record(sample(episodeId, 0), date, from)
        var elapsed = 0L
        while (elapsed < minutes) {
            elapsed = minOf(elapsed + 10, minutes)
            service.record(sample(episodeId, elapsed), date, from.plusSeconds(elapsed * 60))
        }
        return from.plusSeconds(minutes * 60)
    }

    private fun markedCount(): Int? = QuarkusTransaction.requiringNew().call {
        val item = checklistItems.findByKey(PODCAST_KEY)!!
        checklistEntries.listByDate(date).firstOrNull { it.itemId == item.id }?.count
    }

    private fun sessionCount(): Int = QuarkusTransaction.requiringNew().call { sessions.listByDate(date).size }

    /** The starts of the date's listening windows, in the order the sessions appeared. */
    private fun startProgresses(): List<Long?> = QuarkusTransaction.requiringNew().call {
        sessions.listByDate(date).sortedBy { it.startedAt }.map { it.startProgressMs }
    }

    private fun lastProgresses(): List<Long> = QuarkusTransaction.requiringNew().call {
        sessions.listByDate(date).sortedBy { it.startedAt }.map { it.lastProgressMs }
    }

    @Test
    fun `the same episode playing on keeps one session`() {
        listen("A", 30, start)

        assertEquals(1, sessionCount())
        assertEquals(30, service.minutesOn(date))
    }

    @Test
    fun `one episode taken there and back gives a card to each run`() {
        listen("A", 30, start)
        // An hour of silence is longer than the gluing threshold: this is another sitting.
        listen("A", 30, start.plusSeconds(3600 + 30 * 60))

        assertEquals(2, sessionCount())
        assertEquals(60, service.minutesOn(date))
        // One episode, TWO sittings: each is a card of its own.
        assertEquals(listOf("A", "A"), service.runsOn(date).map { it.episodeId })
        assertEquals(listOf(30, 30), service.runsOn(date).map { (it.listenedMs / 60_000).toInt() })
    }

    @Test
    fun `a short break stays one run even though storage split the session`() {
        listen("A", 30, start)
        // 20 minutes of silence: a new session for storage (threshold 15), the same sitting for the board.
        listen("A", 30, start.plusSeconds(30 * 60 + 20 * 60))

        assertEquals(2, sessionCount(), "хранение рвёт по своему порогу")
        assertEquals(60, service.minutesOn(date))
        assertEquals(listOf("A"), service.runsOn(date).map { it.episodeId })
    }

    @Test
    fun `switching episodes gives two cards ordered by when they started`() {
        val afterFirst = listen("A", 30, start)
        listen("B", 30, afterFirst.plusSeconds(600))

        assertEquals(60, service.minutesOn(date))
        assertEquals(listOf("A", "B"), service.runsOn(date).map { it.episodeId })
    }

    @Test
    fun `the mark grows with the minutes as the day goes on`() {
        listen("A", 20, start)
        assertEquals(0, markedCount(), "20 минут — порог ещё не взят")

        val afterFirst = listen("A", 10, start.plusSeconds(20 * 60))
        assertEquals(1, markedCount(), "30 минут — первая остановка закрыта")

        listen("B", 30, afterFirst.plusSeconds(600))
        assertEquals(2, markedCount(), "60 минут — закрыты обе")
    }

    @Test
    fun `short sittings are all kept and a long day marks past the target`() {
        // Three 20-minute sittings of different episodes: none closes a stop alone, yet each is
        // a card, and the 60-minute day closes two stops.
        var at = start
        for (episode in listOf("A", "B", "C")) at = listen(episode, 20, at).plusSeconds(600)
        assertEquals(listOf("A", "B", "C"), service.runsOn(date).map { it.episodeId })

        listen("D", 20, at)
        assertEquals(3, markedCount(), "80 минут — три остановки при цели 2")
    }

    @Test
    fun `an episode started from the top is a stretch that begins at zero`() {
        listen("A", 30, start)

        // The chunk of the episode, not just its length: retelling what was heard (PRD §5.16) is
        // impossible without the window's start.
        assertEquals(listOf(0L), startProgresses())
        assertEquals(listOf(30L * 60_000), lastProgresses())
    }

    @Test
    fun `an episode continued from the middle keeps the middle as its start`() {
        // Yesterday's episode resumed at minute 20: those first 20 minutes were not heard today
        // and count neither as minutes nor as part of the chunk to retell.
        service.record(sample("A", 20), date, start)
        service.record(sample("A", 30), date, start.plusSeconds(600))

        assertEquals(listOf(20L * 60_000), startProgresses())
        assertEquals(10, service.minutesOn(date), "чужие 20 минут в зачёт не идут")
    }

    @Test
    fun `each run of the same episode remembers where it began`() {
        listen("A", 30, start)
        // An hour of silence: a new session of the same episode, starting where the last one ended.
        service.record(sample("A", 30), date, start.plusSeconds(3600 + 30 * 60))

        assertEquals(listOf(0L, 30L * 60_000), startProgresses())
    }

    @Test
    fun `a mark sent from the shortcut wins and the poller stops touching it`() {
        // The shortcut got there first: the row becomes manual.
        QuarkusTransaction.requiringNew().run {
            checklistEntries.upsert(date, checklistItems.findByKey(PODCAST_KEY)!!, 1)
        }

        listen("A", 60, start)

        assertEquals(1, markedCount(), "поллер насчитал две остановки, но ручной ввод главнее")
        // Sessions are still written as usual — cards do not suffer from the fight over the mark.
        assertEquals(60, service.minutesOn(date))
    }

    private companion object {
        const val PODCAST_KEY = "podcasts"
    }
}
