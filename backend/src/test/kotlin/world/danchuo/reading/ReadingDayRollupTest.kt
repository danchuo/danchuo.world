package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Rolling a day of reading up into marks of the "reading" item (PRD §5.16). The shelf knows TIME,
 * not pages, so a stop closes on every full 25 minutes of the day's SUM — 20 minutes in the
 * morning and 20 in the evening close one stop, though neither session reached the threshold.
 */
class ReadingDayRollupTest {

    @Test
    fun `nothing read closes nothing`() {
        assertEquals(0, ReadingDayRollup.occurrences(0))
    }

    @Test
    fun `just short of the threshold still closes nothing`() {
        assertEquals(0, ReadingDayRollup.occurrences(24 * 60 + 59))
    }

    @Test
    fun `a full twenty five minutes closes one stop`() {
        assertEquals(1, ReadingDayRollup.occurrences(25 * 60))
    }

    @Test
    fun `two half-hour sessions close both stops`() {
        assertEquals(2, ReadingDayRollup.occurrences(2 * 30 * 60))
    }

    @Test
    fun `short stretches add up across the day`() {
        // 15 + 15 minutes: no session reached the threshold, but the day did.
        assertEquals(1, ReadingDayRollup.occurrences(30 * 60))
    }

    @Test
    fun `a marathon keeps counting past the item's target`() {
        // Four hours are nine full thresholds: the board shows "9/2", not a clipped "2/2".
        assertEquals(9, ReadingDayRollup.occurrences(4 * 3_600))
    }

    @Test
    fun `minutes for the item caption round down to whole ones`() {
        assertEquals(0, ReadingDayRollup.minutes(59))
        assertEquals(1, ReadingDayRollup.minutes(60))
        assertEquals(30, ReadingDayRollup.minutes(30 * 60 + 59))
    }
}
