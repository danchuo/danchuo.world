package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Pure arithmetic of listened time (PRD §5.6). Polling gives the playhead position, and minutes
 * come from ITS delta rather than the number of polls, or a pause and a seek both lie. Forward
 * seeks clamp to real time, and a first sample counts only if the episode started at the top.
 */
class PodcastListenMathTest {

    private val t0: Instant = Instant.parse("2026-08-12T08:00:00Z")

    private fun tick(fromMs: Long, toMs: Long, afterSeconds: Long) =
        PodcastListenMath.tickCredit(fromMs, t0, toMs, t0.plusSeconds(afterSeconds))

    @Test
    fun `steady playback credits the progress delta`() {
        assertEquals(60_000L, tick(1_911_000, 1_971_000, 60))
    }

    @Test
    fun `progress running a second ahead of the clock is clamped to real time`() {
        // Seen live: steps alternate 60/61 s because of sub-second rounding.
        assertEquals(60_000L, tick(1_911_000, 1_972_000, 60))
    }

    @Test
    fun `pause credits nothing`() {
        assertEquals(0L, tick(1_911_000, 1_911_000, 60))
    }

    @Test
    fun `skipping forward credits only the time actually elapsed`() {
        // Five minutes of ads skipped inside one polling interval — still one minute listened.
        assertEquals(60_000L, tick(1_911_000, 2_211_000, 60))
    }

    @Test
    fun `rewinding credits nothing but does not go negative`() {
        assertEquals(0L, tick(1_911_000, 1_611_000, 60))
    }

    @Test
    fun `two samples with the same timestamp credit nothing`() {
        assertEquals(0L, tick(1_911_000, 1_971_000, 0))
    }

    @Test
    fun `session opened at the very start of an episode credits what was already played`() {
        assertEquals(12_000L, PodcastListenMath.openingCredit(12_000))
    }

    @Test
    fun `session opened exactly at the tolerance still counts`() {
        assertEquals(
            PodcastListenMath.START_TOLERANCE_MS,
            PodcastListenMath.openingCredit(PodcastListenMath.START_TOLERANCE_MS),
        )
    }

    @Test
    fun `session resumed from the middle credits nothing`() {
        // Resuming yesterday's episode at minute 20: crediting those 20 minutes would be a lie.
        assertEquals(0L, PodcastListenMath.openingCredit(1_200_000))
    }
}
