package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Как длинный кусок ужимается под потолок одного вызова модели (PRD §5.16).
 *
 * Правило одно и оно не про экономию: **обрезать по началу нельзя**. Пересказ, оборванный на
 * середине захода, молчал бы ровно про то место, где владелец остановился, — а оно самое
 * памятное. Вместо обрезки берём несколько равномерных окон по всей длине, последнее — впритык
 * к концу, и отмечаем пропуски явно, чтобы модель видела разрывы, а не сочиняла мостики.
 *
 * Живёт правило здесь, а не в [world.danchuo.reading.EpubBook], потому что оно ничего не знает
 * про книги. Час речи даёт больше знаков, чем час чтения (замер: 767 знаков на минуту
 * расшифровки против потолка в 12 тысяч), так что для подкастов эта нарезка станет не краевым
 * случаем, а основным путём.
 */
class SummaryWindowsTest {

    /** Узнаваемый текст: позицию любого куска видно по номеру. */
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

        // То место, где владелец остановился, обязано доехать до модели.
        assertTrue(capped.trimEnd().endsWith("слово2000"), "конец куска потерян: ...${capped.takeLast(60)}")
    }

    @Test
    fun `gaps between windows are marked explicitly`() {
        val capped = SummaryWindows.cap(long, 2_000)

        assertTrue(capped.contains("[…]"), "разрывы должны быть видны модели: $capped")
        // Начало тоже на месте: окна идут по всей длине, а не только по хвосту.
        assertTrue(capped.startsWith("слово1"), "начало куска потеряно: ${capped.take(60)}")
    }

    @Test
    fun `a ceiling too small for windows falls back to one solid excerpt`() {
        // Окно тоньше нескольких сотен знаков пересказывать нечем — тогда честнее одна связная
        // выдержка от начала, чем четыре обрывка по паре слов.
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
