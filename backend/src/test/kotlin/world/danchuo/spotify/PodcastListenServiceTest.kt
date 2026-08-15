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
 * Сшивка отсчётов плеера в сессии и производная отметка пункта (PRD §5.6).
 *
 * Чистая арифметика проверена отдельно ([PodcastListenMathTest], [PodcastDayRollupTest]) — здесь
 * ровно то, что без БД не проверить: когда сессия тянется дальше, а когда начинается новая, и
 * кто выигрывает спор за отметку с интерактивным шорткатом.
 *
 * Тесты делят одну БД с соседями, поэтому дата своя и всё записанное убирается в [cleanup].
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

    /** Своя дата: соседние тесты сеют дни фикстурами и не должны видеть чужие сессии. */
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

    /** Прослушать [minutes] шагами по 10 минут — внутри порога разрыва, значит одной сессией. */
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

    /** Начала окон прослушивания за дату, в порядке появления сессий. */
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
        // Час тишины — пауза больше порога склейки: это уже другой заход.
        listen("A", 30, start.plusSeconds(3600 + 30 * 60))

        assertEquals(2, sessionCount())
        assertEquals(60, service.minutesOn(date))
        // Эпизод один, а карточки ДВЕ: обе остановки закрыты разными заходами.
        assertEquals(listOf("A", "A"), service.cardsOn(date, 2).map { it.episodeId })
        assertEquals(listOf(30, 30), service.cardsOn(date, 2).map { (it.listenedMs / 60_000).toInt() })
    }

    @Test
    fun `a short break stays one run even though storage split the session`() {
        listen("A", 30, start)
        // 20 минут тишины: для хранения это новая сессия (порог 15), для борда — тот же заход.
        listen("A", 30, start.plusSeconds(30 * 60 + 20 * 60))

        assertEquals(2, sessionCount(), "хранение рвёт по своему порогу")
        assertEquals(60, service.minutesOn(date))
        assertEquals(listOf("A"), service.cardsOn(date, 2).map { it.episodeId })
    }

    @Test
    fun `switching episodes gives two cards ordered by when they started`() {
        val afterFirst = listen("A", 30, start)
        listen("B", 30, afterFirst.plusSeconds(600))

        assertEquals(60, service.minutesOn(date))
        assertEquals(listOf("A", "B"), service.cardsOn(date, 2).map { it.episodeId })
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
    fun `an episode started from the top is a stretch that begins at zero`() {
        listen("A", 30, start)

        // Кусок эпизода, а не только его длина: 0 → 30 минут (PRD §5.16, вторая половина —
        // пересказ прослушанного — без начала окна невозможна).
        assertEquals(listOf(0L), startProgresses())
        assertEquals(listOf(30L * 60_000), lastProgresses())
    }

    @Test
    fun `an episode continued from the middle keeps the middle as its start`() {
        // Вчерашний эпизод продолжен с 20-й минуты: первые 20 минут слушали не сегодня, и
        // засчитывать их нельзя — ни в минуты, ни в кусок, который потом пересказывать.
        service.record(sample("A", 20), date, start)
        service.record(sample("A", 30), date, start.plusSeconds(600))

        assertEquals(listOf(20L * 60_000), startProgresses())
        assertEquals(10, service.minutesOn(date), "чужие 20 минут в зачёт не идут")
    }

    @Test
    fun `each run of the same episode remembers where it began`() {
        listen("A", 30, start)
        // Час тишины — новая сессия того же эпизода, и начинается она там, где кончилась прошлая.
        service.record(sample("A", 30), date, start.plusSeconds(3600 + 30 * 60))

        assertEquals(listOf(0L, 30L * 60_000), startProgresses())
    }

    @Test
    fun `a mark sent from the shortcut wins and the poller stops touching it`() {
        // Шорткат отработал первым: строка становится ручной.
        QuarkusTransaction.requiringNew().run {
            checklistEntries.upsert(date, checklistItems.findByKey(PODCAST_KEY)!!, 1)
        }

        listen("A", 60, start)

        assertEquals(1, markedCount(), "поллер насчитал две остановки, но ручной ввод главнее")
        // Сессии при этом пишутся как обычно — карточки от спора за отметку не страдают.
        assertEquals(60, service.minutesOn(date))
    }

    private companion object {
        const val PODCAST_KEY = "podcasts"
    }
}
