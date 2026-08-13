package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

/**
 * Арифметика сессий чтения (PRD §5.16). Минуты считает сама читалка — она копит их в
 * счётчике «книга × день»; наше дело — разложить прирост счётчика на сессии.
 *
 * Отсюда главный приём: **зачёт = сколько у читалки минус сколько мы уже записали**.
 * Состояние поллера — это сумма наших же строк, отдельной колонки-курсора нет. Такой зачёт
 * самовосстанавливается: пропущенный опрос, поздний синк офлайнового дня и перезапуск бэкенда
 * дают недобор ровно до следующего такта, а не расхождение навсегда.
 *
 * Проверяем:
 * - **обычный прирост**: разница между счётчиком читалки и нашей суммой;
 * - **ничего не изменилось**: тот же счётчик — нулевой зачёт (опрос впустую, файл не менялся);
 * - **счётчик уехал назад**: переустановка читалки или откат базы из бэкапа не должны давать
 *   отрицательных минут — зачёт ноль, дальше считаем от нового уровня;
 * - **разрыв сессии**: пауза больше порога открывает новую строку, меньше — тянет прежнюю;
 * - **первая сессия дня**: тянуть нечего, порог не при чём.
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
        // Переустановленная читалка либо база, откатившаяся из бэкапа: у неё меньше нашего.
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
        // Сбитые часы: отрицательная пауза безопаснее трактуется как «это другая сессия».
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
