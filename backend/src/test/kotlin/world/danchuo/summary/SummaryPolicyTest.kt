package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Queue rules for retellings (PRD §5.16) — who is worth asking the model about. Four rules, all
 * about what has already been told rather than how many attempts were made: never asked ⇒ take;
 * told and the sitting has not moved ⇒ skip; grown past the threshold ⇒ take again.
 */

/**
 * Misses are counted PER TARGET: a sitting that grew further is a new target, and the earlier
 * "giving up" was decided about a different chunk.
 */
class SummaryPolicyTest {

    private val refresh = 0.02
    private val maxAttempts = 3

    @Test
    fun `a sitting nobody asked about is in line`() {
        assertTrue(queued(end = 0.15, known = null))
    }

    @Test
    fun `a retold sitting that has not moved is left alone`() {
        assertFalse(queued(end = 0.15, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a sitting that grew past the threshold comes back in line`() {
        assertTrue(queued(end = 0.30, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a hair of extra progress does not wake the queue`() {
        // Half a percent of a book is the reader's rounding and a couple of paragraphs. A zero
        // instead of the threshold would mean a trip to the model on every poller tick.
        assertFalse(queued(end = 0.16, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a miss keeps the sitting in line until the attempts run out`() {
        assertTrue(queued(end = 0.15, known = missed(target = 0.15, attempts = 1)))
        assertTrue(queued(end = 0.15, known = missed(target = 0.15, attempts = 2)))
        assertFalse(queued(end = 0.15, known = missed(target = 0.15, attempts = 3)))
    }

    @Test
    fun `growing further gives a given-up sitting another chance`() {
        val givenUp = missed(target = 0.15, attempts = 3)

        assertFalse(queued(end = 0.15, known = givenUp), "попытки на эту цель вышли")
        assertTrue(queued(end = 0.40, known = givenUp), "дорос — это другая цель, счёт заново")
    }

    @Test
    fun `the attempt counter restarts on a new target and adds up on the same one`() {
        // The miss count holds "give up" only for the target it was aimed at.
        assertEquals(1, attempts(known = null, end = 0.15))
        assertEquals(2, attempts(known = missed(target = 0.15, attempts = 1), end = 0.15))
        assertEquals(1, attempts(known = missed(target = 0.15, attempts = 2), end = 0.40))
    }

    @Test
    fun `a sitting told about a shorter stretch is asked again even after a miss`() {
        // A refresh missed: the target is unchanged and attempts tick, but until they run out the
        // sitting stays queued — the card is showing text about a smaller chunk.
        val stale = SummaryState(ready = true, coveredEnd = 0.15, targetEnd = 0.40, attempts = 1)

        assertTrue(queued(end = 0.40, known = stale))
    }

    private fun queued(end: Double, known: SummaryState?): Boolean =
        SummaryPolicy.queued(end, known, refresh, maxAttempts)

    private fun attempts(known: SummaryState?, end: Double): Int =
        SummaryPolicy.attemptsAfter(known, end, refresh)

    /** The sitting is told up to [covered], and the last attempt aimed at [target]. */
    private fun told(covered: Double, target: Double) =
        SummaryState(ready = true, coveredEnd = covered, targetEnd = target, attempts = 0)

    /** The sitting could not be told: nothing covered, but the attempts are counted. */
    private fun missed(target: Double, attempts: Int) =
        SummaryState(ready = false, coveredEnd = null, targetEnd = target, attempts = attempts)
}
