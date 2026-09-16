package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * Mindfulness minutes laid out over evening windows (PRD §5.6). The "diary" item is set by time
 * in the Journal app, which arrives from HealthKit in chunks and lands in the day's EVENING
 * bucket: 19:00 → 02:00 next day, so calendar midnight is not the boundary.
 */
class JournalDetectorTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")
    private val from: LocalTime = LocalTime.of(19, 0)
    private val to: LocalTime = LocalTime.of(2, 0)

    private fun at(iso: String): Instant =
        LocalDateTime.parse(iso).atZone(msk).toInstant()

    private fun seg(start: String, end: String) = MindfulSegment(at(start), at(end))

    private fun minutes(vararg segments: MindfulSegment): Map<LocalDate, Int> =
        JournalDetector.minutesByDay(segments.toList(), from, to, msk)

    private fun day(d: String) = LocalDate.parse(d)

    @Test
    fun `evening session lands on its own day`() {
        val byDay = minutes(seg("2026-07-27T21:04", "2026-07-27T21:26"))

        assertEquals(22, byDay[day("2026-07-27")])
        assertEquals(1, byDay.size)
    }

    @Test
    fun `session crossing midnight stays on the day it belongs to, whole`() {
        // Cutting at midnight would split the evening in two and the threshold would never be reached.
        val byDay = minutes(seg("2026-07-27T23:40", "2026-07-28T00:20"))

        assertEquals(40, byDay[day("2026-07-27")])
        assertNull(byDay[day("2026-07-28")])
    }

    @Test
    fun `after-midnight session belongs to the previous day`() {
        val byDay = minutes(seg("2026-07-28T01:10", "2026-07-28T01:40"))

        assertEquals(30, byDay[day("2026-07-27")])
        assertNull(byDay[day("2026-07-28")])
    }

    @Test
    fun `session is clipped to the window edges, not counted whole`() {
        // Nothing before the window counts, or daytime use of the app would earn the evening's mark.
        val byDay = minutes(seg("2026-07-27T18:30", "2026-07-27T19:20"))

        assertEquals(20, byDay[day("2026-07-27")])
    }

    @Test
    fun `session running past the closing edge is clipped too`() {
        val byDay = minutes(seg("2026-07-28T01:40", "2026-07-28T02:30"))

        assertEquals(20, byDay[day("2026-07-27")])
    }

    @Test
    fun `daytime session is outside every window`() {
        val byDay = minutes(seg("2026-07-27T14:00", "2026-07-27T15:00"))

        assertTrue(byDay.isEmpty())
    }

    @Test
    fun `overlapping duplicates do not double-count`() {
        // Shortcuts does not deduplicate samples: the same trap that doubled the night before sessionisation.
        val byDay = minutes(
            seg("2026-07-27T21:00", "2026-07-27T21:30"),
            seg("2026-07-27T21:10", "2026-07-27T21:40"),
        )

        assertEquals(40, byDay[day("2026-07-27")])
    }

    @Test
    fun `one wide pull fills two evening buckets at once`() {
        // This is why the shortcut carries 34 hours: the midnight run closes out yesterday.
        val byDay = minutes(
            seg("2026-07-26T20:00", "2026-07-26T20:25"),
            seg("2026-07-27T21:00", "2026-07-27T21:16"),
        )

        assertEquals(25, byDay[day("2026-07-26")])
        assertEquals(16, byDay[day("2026-07-27")])
    }

    @Test
    fun `fragmented chunks of one evening add up, daytime ones stay out`() {
        // Journal writes a scatter of short chunks with pauses rather than one session. The
        // question is "how many minutes this evening", so it is a plain sum inside the window
        // and there is no sessionising as there is for sleep.
        val byDay = minutes(
            seg("2026-07-09T13:24:42", "2026-07-09T13:25:43"),
            seg("2026-07-09T16:45:17", "2026-07-09T16:50:02"),
            seg("2026-07-09T22:49:52", "2026-07-09T22:52:45"),
            seg("2026-07-09T22:53:23", "2026-07-09T22:56:58"),
        )

        // 2:53 + 3:35 = 6:28 ⇒ 6 minutes; daytime chunks never reach the evening bucket
        assertEquals(6, byDay[day("2026-07-09")])
        assertEquals(1, byDay.size)
    }

    @Test
    fun `empty and degenerate input yields nothing`() {
        assertTrue(JournalDetector.minutesByDay(emptyList(), from, to, msk).isEmpty())
        assertTrue(minutes(seg("2026-07-27T21:00", "2026-07-27T21:00")).isEmpty())
        assertTrue(minutes(seg("2026-07-27T21:30", "2026-07-27T21:00")).isEmpty())
    }
}
