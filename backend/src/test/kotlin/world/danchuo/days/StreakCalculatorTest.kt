package world.danchuo.days

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Pure discipline-streak logic (PRD §5.6), no DB: today joins the run only once done (an unfilled
 * today does not drop it), the first unfinished day breaks the run, and genesis is the floor.
 * A past day counts as it stands: not done ⇒ streak 0.
 */
class StreakCalculatorTest {

    private val genesis = LocalDate.of(2026, 1, 1)
    private val today = LocalDate.of(2026, 6, 21)

    private fun streak(anchor: LocalDate, qualifying: Set<LocalDate>, gen: LocalDate = genesis) =
        StreakCalculator.streak(anchor, today, gen) { it in qualifying }

    private fun streakN(anchor: LocalDate, qualifying: Set<LocalDate>, neutral: Set<LocalDate>) =
        StreakCalculator.streak(anchor, today, genesis, isNeutral = { it in neutral }) { it in qualifying }

    private fun days(vararg iso: String) = iso.map { LocalDate.parse(it) }.toSet()

    @Test
    fun `today done — streak includes today and walks back to the first break`() {
        val q = days("2026-06-21", "2026-06-20", "2026-06-19") // the 18th is not done
        assertEquals(3, streak(today, q))
    }

    @Test
    fun `today empty — streak counts from yesterday, today does not reset it`() {
        val q = days("2026-06-20", "2026-06-19", "2026-06-18") // today (the 21st) is NOT in the set
        assertEquals(3, streak(today, q))
    }

    @Test
    fun `today and yesterday both missing — streak is zero`() {
        val q = days("2026-06-19", "2026-06-18")
        assertEquals(0, streak(today, q))
    }

    @Test
    fun `a gap in the middle breaks the streak`() {
        val q = days("2026-06-21", "2026-06-20", "2026-06-18") // a hole on the 19th
        assertEquals(2, streak(today, q))
    }

    @Test
    fun `past day counts back from itself, inclusive`() {
        val q = days("2026-06-18", "2026-06-17", "2026-06-16") // the 15th is not done
        assertEquals(3, streak(LocalDate.of(2026, 6, 18), q))
    }

    @Test
    fun `past day not done itself yields zero even if earlier days qualify`() {
        val q = days("2026-06-17", "2026-06-16") // the 18th itself is not done
        assertEquals(0, streak(LocalDate.of(2026, 6, 18), q))
    }

    @Test
    fun `streak cannot count past genesis`() {
        val q = days("2026-06-21", "2026-06-20", "2026-06-19", "2026-06-18")
        assertEquals(3, streak(today, q, gen = LocalDate.of(2026, 6, 19)))
    }

    @Test
    fun `future anchor has no streak`() {
        val q = days("2026-06-22", "2026-06-21")
        assertEquals(0, streak(LocalDate.of(2026, 6, 22), q))
    }

    // --- Neutral days (§5.6): "not counted, and does not break" -------------------------------

    @Test
    fun `a neutral day is not counted even when it qualifies`() {
        // ONLY the 18th is done, but it is neutral ⇒ out of the run; the 17th is not done ⇒ 0.
        val q = days("2026-06-18")
        val n = days("2026-06-18")
        assertEquals(0, streakN(LocalDate.of(2026, 6, 18), q, n))
    }

    @Test
    fun `a neutral non-qualifying day does not break the streak — the walk steps over it`() {
        // A hole on the 17th, but the 17th is neutral ⇒ no break: the run steps to the 16th. 18✓ + 16✓ = 2.
        val q = days("2026-06-18", "2026-06-16")
        val n = days("2026-06-17")
        assertEquals(2, streakN(LocalDate.of(2026, 6, 18), q, n))
    }

    @Test
    fun `neutral days are transparent — streak counts qualifying non-neutral days across a gap`() {
        // 20✓(neutral, skipped) 19✓ 18(neutral, skipped) 17✓ 16✗ ⇒ only 19 and 17 count = 2.
        val q = days("2026-06-20", "2026-06-19", "2026-06-18", "2026-06-17")
        val n = days("2026-06-20", "2026-06-18")
        assertEquals(2, streakN(LocalDate.of(2026, 6, 20), q, n))
    }

    @Test
    fun `weekend predicate — Saturday and Sunday are skipped between weekday hits`() {
        // 2026-06-19 Fri, 20 Sat, 21 Sun, 22 Mon. Mon and Fri done, weekend empty ⇒ streak 2.
        val q = days("2026-06-22", "2026-06-19")
        val isWeekend = { d: LocalDate ->
            d.dayOfWeek == java.time.DayOfWeek.SATURDAY || d.dayOfWeek == java.time.DayOfWeek.SUNDAY
        }
        val result = StreakCalculator.streak(
            LocalDate.of(2026, 6, 22), LocalDate.of(2026, 6, 22), genesis, isNeutral = isWeekend,
        ) { it in q }
        assertEquals(2, result)
    }
}
