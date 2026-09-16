package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Where to cut audio to transcribe the listened chunk (PRD §5.16.1). We cut BEFORE transcribing:
 * an hour yields ~46k characters against a 12k excerpt ceiling, so four two-minute windows cost
 * a tenth and answer the same question.
 */

/**
 * The offset is a FRACTION, not milliseconds: shows with dynamic ad insertion drift between RSS
 * and Spotify, and a fraction of the real file size absorbs that. Bytes and time are linear
 * because every checked feed serves CBR mp3, which also removes any need for ffmpeg.
 */
class AudioWindowsTest {

    /** An hour-long episode at 128 kbps: 16 000 bytes per second. */
    private val duration = 3_600_000L
    private val total = 57_600_000L

    @Test
    fun `a short stretch is taken whole, without gaps`() {
        // Three minutes fit one window whole; there is no reason to tear them into four.
        val windows = windows(from = 0.0, to = 180_000.0 / duration)

        assertEquals(1, windows.size)
        assertEquals(0L, windows.first().from)
        assertTrue(windows.first().to in 2_870_000..2_890_000, "≈180 с при 16 КБ/с: ${windows.first()}")
    }

    @Test
    fun `a long stretch is sampled across its whole length`() {
        val windows = windows(from = 0.0, to = 1.0)

        assertEquals(4, windows.size)
        // Windows ascend and never overlap, or the model would get one chunk twice.
        windows.zipWithNext().forEach { (a, b) -> assertTrue(a.to < b.from, "окна перекрылись: $a и $b") }
    }

    @Test
    fun `the last window ends where listening stopped`() {
        // Where the owner stopped is the most memorable place, and cutting "from the start" would
        // be silent about exactly it (the same rule as SummaryWindows for text).
        val to = 0.5
        val windows = windows(from = 0.0, to = to)

        assertEquals((to * total).toLong() - 1, windows.last().to)
    }

    @Test
    fun `windows never run past the file`() {
        val windows = windows(from = 0.9, to = 1.5)

        assertTrue(windows.all { it.to < total }, "вылезли за файл: $windows")
        assertTrue(windows.all { it.from >= 0 }, "ушли левее нуля: $windows")
    }

    @Test
    fun `an empty or inverted stretch gives nothing to cut`() {
        assertTrue(windows(from = 0.5, to = 0.5).isEmpty())
        assertTrue(windows(from = 0.7, to = 0.3).isEmpty())
    }

    @Test
    fun `a file we know nothing about gives nothing to cut`() {
        // A zero duration or a zero size has nothing to divide: stay silent rather than fail.
        assertTrue(AudioWindows.windows(0, duration, 0.0, 1.0, COUNT, WINDOW_MS).isEmpty())
        assertTrue(AudioWindows.windows(total, 0, 0.0, 1.0, COUNT, WINDOW_MS).isEmpty())
    }

    @Test
    fun `the whole cut stays inside the budget of one free lane tick`() {
        // Four three-minute windows — 720 audio-seconds per sitting against a limit of 7200 an hour.
        val seconds = windows(from = 0.0, to = 1.0)
            .sumOf { (it.to - it.from + 1) } * duration / total / 1000

        assertTrue(seconds in 700..740, "бюджет окна уехал: $seconds с")
    }

    private fun windows(from: Double, to: Double) =
        AudioWindows.windows(total, duration, from, to, COUNT, WINDOW_MS)

    private companion object {
        const val COUNT = 4
        const val WINDOW_MS = 180_000L
    }
}
