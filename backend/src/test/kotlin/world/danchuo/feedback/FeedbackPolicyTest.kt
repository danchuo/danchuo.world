package world.danchuo.feedback

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Reading a submitted note (PRD §5.19) — pure logic, no Quarkus or Docker. The asymmetry under
 * test: the visitor's words are rejected when over-long, the context is silently cut.
 */
class FeedbackPolicyTest {

    private inline fun <reified T : FeedbackOutcome> outcome(req: FeedbackRequest): T {
        val out = FeedbackPolicy.read(req)
        assertTrue(out is T) { "expected ${T::class.simpleName}, got $out" }
        return out as T
    }

    private fun accepted(req: FeedbackRequest): FeedbackDraft =
        outcome<FeedbackOutcome.Accepted>(req).draft

    private fun rejected(req: FeedbackRequest): FeedbackOutcome.Rejected = outcome(req)

    @Test
    fun `one answer is enough`() {
        val draft = accepted(FeedbackRequest(path = "/", wouldChange = "  календарь  "))
        assertEquals("календарь", draft.wouldChange)
        assertNull(draft.likedMost)
        assertNull(draft.signature)
    }

    @Test
    fun `a note with no answers is rejected even when signed`() {
        assertEquals("empty", rejected(FeedbackRequest(path = "/", signature = "аня")).error)
        // Whitespace is not an answer.
        assertEquals("empty", rejected(FeedbackRequest(path = "/", likedMost = "   ")).error)
    }

    @Test
    fun `an over-long answer is rejected, never truncated`() {
        val req = FeedbackRequest(path = "/", likedMost = "я".repeat(FeedbackLimits.ANSWER + 1))
        val out = rejected(req)
        assertEquals("too_long", out.error)
        assertEquals("likedMost", out.field)
    }

    @Test
    fun `an over-long signature is rejected on its own smaller limit`() {
        val req = FeedbackRequest(
            path = "/",
            likedMost = "ок",
            signature = "п".repeat(FeedbackLimits.SIGNATURE + 1),
        )
        assertEquals("signature", rejected(req).field)
    }

    @Test
    fun `context is cut silently rather than costing the note`() {
        val draft = accepted(
            FeedbackRequest(
                path = "/",
                likedMost = "ок",
                language = "l".repeat(FeedbackLimits.LANGUAGE + 40),
                waveKey = "w".repeat(FeedbackLimits.WAVE_KEY + 40),
            ),
        )
        assertEquals(FeedbackLimits.LANGUAGE, draft.language?.length)
        assertEquals(FeedbackLimits.WAVE_KEY, draft.waveKey?.length)
    }

    @Test
    fun `path is required and capped`() {
        assertEquals("path", rejected(FeedbackRequest(likedMost = "ок")).field)
        assertEquals(
            "path",
            rejected(FeedbackRequest(likedMost = "ок", path = "/".repeat(FeedbackLimits.PATH + 1))).field,
        )
    }

    @Test
    fun `a filled honeypot is discarded, not reported`() {
        outcome<FeedbackOutcome.Discarded>(
            FeedbackRequest(path = "/", likedMost = "ок", website = "http://spam"),
        )
    }

    @Test
    fun `a malformed day and junk sizes drop without losing the note`() {
        val draft = accepted(
            FeedbackRequest(
                path = "/",
                likedMost = "ок",
                selectedDay = "вчера",
                viewportW = 0,
                screenH = FeedbackLimits.MAX_PIXELS + 1,
            ),
        )
        assertNull(draft.selectedDay)
        assertNull(draft.viewportW)
        assertNull(draft.screenH)
    }

    @Test
    fun `a well-formed day travels through`() {
        val draft = accepted(FeedbackRequest(path = "/", likedMost = "ок", selectedDay = "2026-09-21"))
        assertEquals(LocalDate.of(2026, 9, 21), draft.selectedDay)
    }
}
