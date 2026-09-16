package world.danchuo.github

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * What of the parsed fragment actually reaches storage (PRD §5.4). The fragment returns a whole
 * year of cells on every visit, so the filter does three jobs: it does not break on the genesis
 * guard, does not materialise future days, and does not rewrite a day whose value is unchanged.
 */
class ContributionWriteFilterTest {

    private val genesis = LocalDate.parse("2026-01-01")
    private val today = LocalDate.parse("2026-07-31")

    private fun day(d: String) = LocalDate.parse(d)

    private fun pending(parsed: Map<LocalDate, Int>, stored: Map<LocalDate, Int?> = emptyMap()) =
        ContributionWriteFilter.pending(parsed, stored, genesis, today)

    @Test
    fun `new days are written`() {
        val out = pending(mapOf(day("2026-07-28") to 15, day("2026-07-31") to 3))

        assertEquals(mapOf(day("2026-07-28") to 15, day("2026-07-31") to 3), out)
    }

    @Test
    fun `days before genesis are dropped rather than thrown at the guard`() {
        val out = pending(mapOf(day("2025-12-31") to 4, day("2026-01-01") to 2))

        assertEquals(mapOf(day("2026-01-01") to 2), out)
    }

    /**
     * GitHub serves the tail of the current week as "no contributions" cells; writing them would
     * create tomorrow in the database with a plausible-looking zero.
     */
    @Test
    fun `future days are dropped`() {
        val out = pending(mapOf(day("2026-07-31") to 3, day("2026-08-01") to 0))

        assertEquals(mapOf(day("2026-07-31") to 3), out)
    }

    @Test
    fun `unchanged days are not rewritten`() {
        val out = pending(
            mapOf(day("2026-07-28") to 15, day("2026-07-29") to 5),
            stored = mapOf(day("2026-07-28") to 15, day("2026-07-29") to 4),
        )

        assertEquals(mapOf(day("2026-07-29") to 5), out)
    }

    @Test
    fun `a measured zero over a null is a change`() {
        val out = pending(mapOf(day("2026-07-30") to 0), stored = mapOf(day("2026-07-30") to null))

        assertEquals(mapOf(day("2026-07-30") to 0), out)
    }

    @Test
    fun `nothing parsed means nothing written`() {
        assertTrue(pending(emptyMap(), stored = mapOf(day("2026-07-28") to 15)).isEmpty())
    }
}
