package world.danchuo.days

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Чистая логика стрика дисциплины (PRD §5.6). Проверяем три правила без БД:
 * - **«по вчера, тикает вечером»**: сегодня входит в серию, только если уже выполнено; иначе
 *   отсчёт от вчера, и незаполненное сегодня серию НЕ роняет;
 * - **разрыв на дыре/невыполнении**: первый невыполненный день обрывает серию;
 * - **граница генезиса**: раньше генезиса дней нет — серия там упирается.
 * Прошлый (не сегодняшний) день считается «как есть»: сам не выполнен ⇒ серия 0.
 */
class StreakCalculatorTest {

    private val genesis = LocalDate.of(2026, 1, 1)
    private val today = LocalDate.of(2026, 6, 21)

    private fun streak(anchor: LocalDate, qualifying: Set<LocalDate>, gen: LocalDate = genesis) =
        StreakCalculator.streak(anchor, today, gen) { it in qualifying }

    private fun days(vararg iso: String) = iso.map { LocalDate.parse(it) }.toSet()

    @Test
    fun `today done — streak includes today and walks back to the first break`() {
        val q = days("2026-06-21", "2026-06-20", "2026-06-19") // 18-е не выполнено
        assertEquals(3, streak(today, q))
    }

    @Test
    fun `today empty — streak counts from yesterday, today does not reset it`() {
        val q = days("2026-06-20", "2026-06-19", "2026-06-18") // сегодня (21) НЕ в наборе
        assertEquals(3, streak(today, q))
    }

    @Test
    fun `today and yesterday both missing — streak is zero`() {
        val q = days("2026-06-19", "2026-06-18")
        assertEquals(0, streak(today, q))
    }

    @Test
    fun `a gap in the middle breaks the streak`() {
        val q = days("2026-06-21", "2026-06-20", "2026-06-18") // дыра на 19-м
        assertEquals(2, streak(today, q))
    }

    @Test
    fun `past day counts back from itself, inclusive`() {
        val q = days("2026-06-18", "2026-06-17", "2026-06-16") // 15-е не выполнено
        assertEquals(3, streak(LocalDate.of(2026, 6, 18), q))
    }

    @Test
    fun `past day not done itself yields zero even if earlier days qualify`() {
        val q = days("2026-06-17", "2026-06-16") // сам 18-й не выполнен
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
}
