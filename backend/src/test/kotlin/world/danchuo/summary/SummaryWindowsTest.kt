package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * How a long chunk is squeezed under one model call's ceiling (PRD §5.16). The rule is not about
 * economy: truncating from the start would be silent about exactly where the owner stopped, the
 * most memorable place. Instead, even windows across the length, the last flush to the end.
 */

/**
 * The rule lives here rather than in [world.danchuo.reading.EpubBook] because it knows nothing
 * about books: an hour of speech yields far more characters than an hour of reading, so for
 * podcasts this slicing is the main path rather than an edge case.
 */
class SummaryWindowsTest {

    /** Recognisable text: any chunk's position is visible from the number. */
    private val long = (1..2000).joinToString(" ") { "слово$it" }

    @Test
    fun `a text under the ceiling is left exactly as it was`() {
        assertEquals("короткий кусок", SummaryWindows.cap("короткий кусок", 100))
    }

    @Test
    fun `a capped text never exceeds the ceiling`() {
        assertTrue(SummaryWindows.cap(long, 2_000).length <= 2_000)
        assertTrue(SummaryWindows.cap(long, 500).length <= 500)
        assertTrue(SummaryWindows.cap(long, 60).length <= 60)
    }

    @Test
    fun `the end of the stretch survives capping`() {
        val capped = SummaryWindows.cap(long, 2_000)

        // Where the owner stopped must reach the model.
        assertTrue(capped.trimEnd().endsWith("слово2000"), "конец куска потерян: ...${capped.takeLast(60)}")
    }

    @Test
    fun `gaps between windows are marked explicitly`() {
        val capped = SummaryWindows.cap(long, 2_000)

        assertTrue(capped.contains("[…]"), "разрывы должны быть видны модели: $capped")
        // The start is there too: windows span the whole length, not just the tail.
        assertTrue(capped.startsWith("слово1"), "начало куска потеряно: ${capped.take(60)}")
    }

    @Test
    fun `a ceiling too small for windows falls back to one solid excerpt`() {
        // A window thinner than a few hundred characters has nothing to retell: one coherent
        // excerpt from the start is more honest than four scraps of a couple of words.
        val capped = SummaryWindows.cap(long, 200)

        assertFalse(capped.contains("[…]"))
        assertTrue(capped.startsWith("слово1"))
    }

    @Test
    fun `cutting happens on a word boundary`() {
        val capped = SummaryWindows.cap(long, 200)

        assertFalse(capped.endsWith("слов"), "обрыв на полубукве: ...${capped.takeLast(20)}")
        assertTrue(capped.trimEnd().last().isDigit(), "слово обрезано: ...${capped.takeLast(20)}")
    }
}
