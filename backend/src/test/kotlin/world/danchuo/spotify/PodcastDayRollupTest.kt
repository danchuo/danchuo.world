package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Rolling a day up into marks and sittings (PRD §5.6). Marks go by the day's SUM of minutes (every
 * full 25 closes a stop, with no ceiling); every sitting is a card of its own.
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

    private fun occurrences(minutes: Long) = PodcastDayRollup.occurrences(minutes * 60_000)

    private fun merge(vararg runs: PodcastRun, gapMinutes: Long = 45) =
        PodcastDayRollup.runs(runs.toList(), gapMinutes)

    // ── marks: floor(minutes / 25), uncapped ──

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
    fun `a day of podcasts keeps counting past the target`() {
        assertEquals(12, occurrences(300))
    }

    @Test
    fun `partial minutes below the threshold do not round up`() {
        // 49:59 is still one podcast; exactly 50:00 is two.
        assertEquals(1, PodcastDayRollup.occurrences(2_999_000))
        assertEquals(2, PodcastDayRollup.occurrences(3_000_000))
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

    @Test
    fun `listened minutes floor to whole minutes`() {
        assertEquals(49, PodcastDayRollup.listenedMinutes(2_999_000))
    }

    @Test
    fun `a sitting is settled only once the glue pause has passed since its last sample`() {
        val sitting = run("a", minutes = 60, at = morning)
        val lastSample = sitting.endedAt

        assertEquals(false, PodcastDayRollup.settled(sitting, lastSample.plusSeconds(60), gapMinutes = 45))
        assertEquals(false, PodcastDayRollup.settled(sitting, lastSample.plusSeconds(45 * 60), gapMinutes = 45))
        assertEquals(true, PodcastDayRollup.settled(sitting, lastSample.plusSeconds(46 * 60), gapMinutes = 45))
    }
}
