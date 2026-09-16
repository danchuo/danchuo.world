package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

/**
 * Reading-session arithmetic (PRD §5.16). The reader counts the minutes per book-day; our job is
 * to split its increment into sessions. The trick: tally = the reader's counter minus what we
 * already recorded, so a missed poll or a restart under-counts until the next tick, not forever.
 */
class ReadingSessionMathTest {

    private val gap: Duration = Duration.ofMinutes(45)
    private val at: Instant = Instant.parse("2026-08-13T19:00:00Z")

    @Test
    fun `credit is what the shelf counted minus what we already wrote down`() {
        assertEquals(1_200, ReadingSessionMath.credit(shelfSeconds = 3_000, recordedSeconds = 1_800))
    }

    @Test
    fun `an unchanged counter credits nothing`() {
        assertEquals(0, ReadingSessionMath.credit(shelfSeconds = 1_800, recordedSeconds = 1_800))
    }

    @Test
    fun `a counter that went backwards credits nothing instead of negative minutes`() {
        // A reinstalled reader, or a database rolled back from a backup: it has less than we do.
        assertEquals(0, ReadingSessionMath.credit(shelfSeconds = 600, recordedSeconds = 1_800))
    }

    @Test
    fun `a short pause keeps the same session`() {
        assertTrue(ReadingSessionMath.continues(at.minusSeconds(600), at, gap))
    }

    @Test
    fun `a long pause starts a new session`() {
        assertFalse(ReadingSessionMath.continues(at.minusSeconds(3 * 3_600), at, gap))
    }

    @Test
    fun `nothing open means nothing to continue`() {
        assertFalse(ReadingSessionMath.continues(null, at, gap))
    }

    @Test
    fun `a session from the future is not continued`() {
        // A skewed clock: a negative pause is safer read as "a different session".
        assertFalse(ReadingSessionMath.continues(at.plusSeconds(60), at, gap))
    }

    @Test
    fun `minutes round to the nearest, and anything read at all is at least a minute`() {
        assertEquals(0, ReadingSessionMath.minutes(0))
        assertEquals(1, ReadingSessionMath.minutes(20))
        assertEquals(30, ReadingSessionMath.minutes(1_800))
        assertEquals(31, ReadingSessionMath.minutes(1_860))
    }
}
