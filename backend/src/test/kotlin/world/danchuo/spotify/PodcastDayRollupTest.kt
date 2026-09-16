package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Rolling a day up into marks and cards (PRD §5.6) — two questions counted differently. Marks go
 * by the day's SUM of minutes (every full 25 closes a stop); cards go by SITTINGS, the first two
 * that push the sum past another full 25.
 */

/**
 * The divergence is a consequence, not a bug: a marathon in one sitting gives two marks and ONE
 * card, while the same episode taken there and back gives two marks and TWO cards.
 */
class PodcastDayRollupTest {

    private val morning: Instant = Instant.parse("2026-08-12T05:10:00Z")

    /** Row keys as in the DB: one per session, growing as they are written. */
    private var nextSessionId = 1L

    /** A sitting: minutes listened in a row from [at]. A DB session arrives in this same shape. */
    private fun run(id: String, minutes: Long, at: Instant) = PodcastRun(
        sessionId = nextSessionId++,
        episodeId = id,
        listenedMs = minutes * 60_000,
        startedAt = at,
        endedAt = at.plusSeconds(minutes * 60),
        episodeName = "эпизод $id",
        episodeUrl = "https://open.spotify.com/episode/$id",
        showName = "шоу $id",
        showUrl = "https://open.spotify.com/show/$id",
        imageUrl = null,
        episodeDurationMs = null,
    )

    private fun occurrences(minutes: Long) = PodcastDayRollup.occurrences(minutes * 60_000, target = 2)

    private fun cardIds(vararg runs: PodcastRun) =
        PodcastDayRollup.cards(runs.toList(), max = 2).map { it.episodeId }

    private fun merge(vararg runs: PodcastRun, gapMinutes: Long = 45) =
        PodcastDayRollup.runs(runs.toList(), gapMinutes)

    // ── marks: min(target, floor(minutes / 25)) ──

    @Test
    fun `under the threshold closes nothing`() {
        assertEquals(0, occurrences(24))
    }

    @Test
    fun `exactly the threshold closes the first stop`() {
        assertEquals(1, occurrences(25))
    }

    @Test
    fun `forty minutes is still one podcast`() {
        assertEquals(1, occurrences(40))
    }

    @Test
    fun `forty nine minutes is still one podcast`() {
        assertEquals(1, occurrences(49))
    }

    @Test
    fun `fifty minutes is already two`() {
        assertEquals(2, occurrences(50))
    }

    @Test
    fun `a day of podcasts never exceeds the target`() {
        assertEquals(2, occurrences(300))
    }

    @Test
    fun `partial minutes below the threshold do not round up`() {
        // 49:59 is still one podcast; exactly 50:00 is two.
        assertEquals(1, PodcastDayRollup.occurrences(2_999_000, target = 2))
        assertEquals(2, PodcastDayRollup.occurrences(3_000_000, target = 2))
    }

    // ── sittings: sessions of one episode, glued across a pause ──

    @Test
    fun `a short break keeps one run`() {
        // The storage threshold (15 min) breaks a session sooner than a person considers listening
        // interrupted: lunch in the middle of an episode is the same sitting.
        val before = run("A", 20, morning)
        val after = run("A", 15, morning.plusSeconds(20 * 60 + 30 * 60))
        val merged = merge(before, after)
        assertEquals(1, merged.size)
        assertEquals(35 * 60_000L, merged.single().listenedMs)
        assertEquals(morning, merged.single().startedAt)
    }

    @Test
    fun `a glued run keeps the key of the strip it started with`() {
        // A sitting's key is its FIRST row's key: the retelling hangs off it (§5.16.1), and a
        // chunk glued on afterwards must not move it to another row.
        val before = run("A", 20, morning)
        val after = run("A", 15, morning.plusSeconds(20 * 60 + 30 * 60))

        assertEquals(before.sessionId, merge(before, after).single().sessionId)
        // Argument order does not matter: gluing goes by time, not by call.
        assertEquals(before.sessionId, merge(after, before).single().sessionId)
    }

    @Test
    fun `a long break splits the runs`() {
        val there = run("A", 45, morning)
        val back = run("A", 35, morning.plusSeconds(10 * 3600))
        assertEquals(2, merge(there, back).size)
    }

    @Test
    fun `different episodes never merge even back to back`() {
        val first = run("A", 20, morning)
        val second = run("B", 20, morning.plusSeconds(20 * 60))
        assertEquals(listOf("A", "B"), merge(first, second).map { it.episodeId })
    }

    @Test
    fun `runs come out in chronological order`() {
        val evening = run("B", 30, morning.plusSeconds(10 * 3600))
        val early = run("A", 30, morning)
        assertEquals(listOf("A", "B"), merge(evening, early).map { it.episodeId })
    }

    // ── cards: sittings that pushed the sum past another 25 minutes ──

    @Test
    fun `one episode taken there and back gives two cards`() {
        // The owner's main case: 80 minutes of one episode in two sittings — two stops and TWO
        // cards, because there really were two sittings.
        val there = run("A", 45, morning)
        val back = run("A", 35, morning.plusSeconds(10 * 3600))
        assertEquals(listOf("A", "A"), cardIds(there, back))
        assertEquals(2, occurrences(80))
    }

    @Test
    fun `one long sitting gives a single card even though it closes both stops`() {
        val long = run("A", 120, morning)
        assertEquals(listOf("A"), cardIds(long))
        assertEquals(2, occurrences(120))
    }

    @Test
    fun `two qualifying runs give two cards ordered by when they started`() {
        val evening = run("B", 40, morning.plusSeconds(10 * 3600))
        val early = run("A", 40, morning)
        assertEquals(listOf("A", "B"), cardIds(evening, early))
    }

    @Test
    fun `a run poked and abandoned earns no card but its minutes still count`() {
        // 40 minutes plus a 2-minute poke: the second stop is not closed at all (42 < 50), and the
        // poke has no card — it pushed past no 25-minute mark.
        val real = run("A", 40, morning)
        val poked = run("B", 2, morning.plusSeconds(3600))
        assertEquals(listOf("A"), cardIds(real, poked))
        assertEquals(1, occurrences(42))
    }

    @Test
    fun `a fragmented day still fills both stops`() {
        // Four 20-minute chunks: none reaches the threshold alone, but two of them pushed the day
        // past its 25th and 50th minute — those two get the cards.
        val runs = listOf(
            run("A", 20, morning),
            run("B", 20, morning.plusSeconds(2 * 3600)),
            run("C", 20, morning.plusSeconds(4 * 3600)),
            run("D", 20, morning.plusSeconds(6 * 3600)),
        )
        assertEquals(listOf("B", "C"), PodcastDayRollup.cards(runs, max = 2).map { it.episodeId })
    }

    @Test
    fun `a marathon day shows the first two, not the longest`() {
        val first = run("A", 30, morning)
        val second = run("B", 30, morning.plusSeconds(3600))
        val longest = run("C", 90, morning.plusSeconds(7200))
        assertEquals(listOf("A", "B"), cardIds(first, second, longest))
    }

    @Test
    fun `nothing qualifying gives no cards`() {
        assertEquals(emptyList<String>(), cardIds(run("A", 10, morning)))
    }

    @Test
    fun `listened minutes floor to whole minutes`() {
        assertEquals(49, PodcastDayRollup.listenedMinutes(2_999_000))
    }
}
