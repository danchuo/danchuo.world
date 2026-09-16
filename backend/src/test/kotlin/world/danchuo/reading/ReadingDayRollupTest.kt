package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Rolling a day of reading up into marks of the "reading" item (PRD §5.16). The shelf knows TIME,
 * not pages, so a stop closes on every full 25 minutes of the day's SUM — 20 minutes in the
 * morning and 20 in the evening close one stop, though neither session reached the threshold.
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
        // 15 + 15 minutes: no session reached the threshold, but the day did.
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
        // An hour in one sitting: two marks and ONE card — there was a single sitting, and the
        // second stop has nothing to add over the first (the same rule as for podcasts).
        val cards = ReadingDayRollup.cards(listOf(session(60 * 60)), target)

        assertEquals(1, cards.size)
    }

    @Test
    fun `a short session that tips the day over the threshold takes the card`() {
        // 20 minutes misses the threshold, the next 10 bring the sum to 30 — the second takes the card.
        val cards = ReadingDayRollup.cards(listOf(session(20 * 60), session(10 * 60)), target)

        assertEquals(listOf(10 * 60), cards.map { it.readSeconds })
    }

    @Test
    fun `sessions that never reach the threshold take no cards`() {
        assertEquals(emptyList<ReadingSession>(), ReadingDayRollup.cards(listOf(session(5 * 60)), target))
    }

    private fun session(seconds: Int) = ReadingSession().apply { readSeconds = seconds }
}
