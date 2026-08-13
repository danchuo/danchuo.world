package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Свёртка суток чтения в отметки пункта «Чтение» (PRD §5.16).
 *
 * Порог тот же, что у подкастов, и по той же причине: полка читалки знает ВРЕМЯ чтения, а не
 * страницы, поэтому остановка закрывается каждыми полными 25 минутами за сутки. Схема переживает
 * и «две получасовые сессии», и «один час в присест», и «15 минут утром плюс 15 вечером».
 *
 * Считаем по СУММЕ дня, а не по сессиям: 20 минут утром и 20 вечером — это 40 минут чтения,
 * то есть одна закрытая остановка, хотя ни одна сессия порога не взяла.
 */
class ReadingDayRollupTest {

    private val target = 2

    @Test
    fun `nothing read closes nothing`() {
        assertEquals(0, ReadingDayRollup.occurrences(0, target))
    }

    @Test
    fun `just short of the threshold still closes nothing`() {
        assertEquals(0, ReadingDayRollup.occurrences(24 * 60 + 59, target))
    }

    @Test
    fun `a full twenty five minutes closes one stop`() {
        assertEquals(1, ReadingDayRollup.occurrences(25 * 60, target))
    }

    @Test
    fun `two half-hour sessions close both stops`() {
        assertEquals(2, ReadingDayRollup.occurrences(2 * 30 * 60, target))
    }

    @Test
    fun `short stretches add up across the day`() {
        // 15 + 15 минут: ни одна сессия порога не взяла, а день — взял.
        assertEquals(1, ReadingDayRollup.occurrences(30 * 60, target))
    }

    @Test
    fun `a marathon cannot close more stops than the item has`() {
        assertEquals(2, ReadingDayRollup.occurrences(4 * 3_600, target))
    }

    @Test
    fun `minutes for the item caption round down to whole ones`() {
        assertEquals(0, ReadingDayRollup.minutes(59))
        assertEquals(1, ReadingDayRollup.minutes(60))
        assertEquals(30, ReadingDayRollup.minutes(30 * 60 + 59))
    }

    @Test
    fun `two half-hour sessions take one card each`() {
        val cards = ReadingDayRollup.cards(listOf(session(30 * 60), session(30 * 60)), target)

        assertEquals(listOf(30 * 60, 30 * 60), cards.map { it.readSeconds })
    }

    @Test
    fun `one long sitting closes both stops but tells only one story`() {
        // Час в присест — две отметки и ОДНА карточка: заход был один, второй остановке нечего
        // рассказать сверх первой (то же правило и та же оговорка, что у подкастов).
        val cards = ReadingDayRollup.cards(listOf(session(60 * 60)), target)

        assertEquals(1, cards.size)
    }

    @Test
    fun `a short session that tips the day over the threshold takes the card`() {
        // 20 минут порога не берут, следующие 10 доводят сумму до 30 — карточку берёт вторая.
        val cards = ReadingDayRollup.cards(listOf(session(20 * 60), session(10 * 60)), target)

        assertEquals(listOf(10 * 60), cards.map { it.readSeconds })
    }

    @Test
    fun `sessions that never reach the threshold take no cards`() {
        assertEquals(emptyList<ReadingSession>(), ReadingDayRollup.cards(listOf(session(5 * 60)), target))
    }

    private fun session(seconds: Int) = ReadingSession().apply { readSeconds = seconds }
}
