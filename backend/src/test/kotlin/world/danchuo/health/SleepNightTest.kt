package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * The night as it happened (PRD §5.4, registry I-23): laid out in time instead of one sum. The
 * sum answers "how much", the band answers "how" — when sleep began, where it dropped, that at
 * 3:40 there was none. Ingest receives the same chunks; now they survive to output.
 */
class SleepNightTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")
    private val wakeDate: LocalDate = LocalDate.of(2026, 7, 28)

    private fun at(iso: String): Instant = LocalDateTime.parse(iso).atZone(msk).toInstant()

    private fun seg(stage: SleepStage, from: String, to: String) =
        SleepSegment(stage, at(from), at(to))

    /** The 23:20 → 07:20 night with a waking at 06:00 (the same one as in [SleepSessionizerTest]). */
    private fun night() = listOf(
        seg(SleepStage.LIGHT, "2026-07-27T23:20", "2026-07-27T23:50"),
        seg(SleepStage.DEEP, "2026-07-27T23:50", "2026-07-28T00:40"),
        seg(SleepStage.REM, "2026-07-28T00:40", "2026-07-28T01:40"),
        seg(SleepStage.LIGHT, "2026-07-28T01:40", "2026-07-28T06:00"),
        seg(SleepStage.AWAKE, "2026-07-28T06:00", "2026-07-28T06:20"),
        seg(SleepStage.DEEP, "2026-07-28T06:20", "2026-07-28T07:20"),
    )

    // --- assembling the night from chunks ---

    @Test
    fun `night keeps chunks in order and keeps the awake gap visible`() {
        val parts = SleepNight.of(night(), wakeDate, msk)

        assertEquals(6, parts.size)
        assertEquals(SleepStage.LIGHT, parts.first().stage)
        assertEquals(at("2026-07-27T23:20"), parts.first().start)
        assertEquals(at("2026-07-28T07:20"), parts.last().end)
        // A waking is not a hole in the data but a fact of the night: it stays a chunk of its phase.
        assertTrue(parts.any { it.stage == SleepStage.AWAKE && it.start == at("2026-07-28T06:00") })
    }

    @Test
    fun `overlapping sources collapse into one timeline, not a doubled night`() {
        val parts = SleepNight.of(
            listOf(
                seg(SleepStage.UNSPECIFIED, "2026-07-27T23:00", "2026-07-28T06:00"), // the phone
                seg(SleepStage.REM, "2026-07-28T01:00", "2026-07-28T02:00"), // the watch on top
            ),
            wakeDate,
            msk,
        )

        // 23:00→01:00 · 01:00→02:00 REM · 02:00→06:00 — chunks run consecutively and never overlap
        assertEquals(3, parts.size)
        assertEquals(
            listOf(SleepStage.UNSPECIFIED, SleepStage.REM, SleepStage.UNSPECIFIED),
            parts.map { it.stage },
        )
        parts.zipWithNext().forEach { (a, b) -> assertTrue(!a.end.isAfter(b.start)) }
    }

    @Test
    fun `a night without a watch reads as light — the client has no fifth phase`() {
        // "Asleep, phase unknown" is the phone's own labelling, not a fifth phase: the day's sum
        // already folds it into light, and the band must say the same thing.
        val band = SleepBand.of(
            SleepNight.of(
                listOf(seg(SleepStage.UNSPECIFIED, "2026-07-27T23:10", "2026-07-28T07:10")),
                wakeDate,
                msk,
            ),
            wakeDate,
            msk,
        )!!
        assertEquals(listOf("light"), band.parts.map { it.stage })
    }

    @Test
    fun `the band separates lying down from falling asleep`() {
        val band = SleepBand.of(
            SleepNight.of(
                listOf(
                    seg(SleepStage.AWAKE, "2026-07-27T23:00", "2026-07-27T23:30"), // in bed, tossing
                    seg(SleepStage.LIGHT, "2026-07-27T23:30", "2026-07-28T06:00"),
                ),
                wakeDate,
                msk,
            ),
            wakeDate,
            msk,
        )!!
        assertEquals(300, band.onsetMinute) // 23:00 — in bed
        assertEquals(330, band.asleepFromMinute) // 23:30 — asleep
        assertEquals(390, band.asleepMinutes) // half an hour of tossing is not sleep
    }

    @Test
    fun `a hole in the samples stays a hole — the band is not glued shut`() {
        val parts = SleepNight.of(
            listOf(
                seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T02:00"),
                // 20 minutes without samples: the same session, but the band must show the gap
                seg(SleepStage.LIGHT, "2026-07-28T02:20", "2026-07-28T06:00"),
            ),
            wakeDate,
            msk,
        )

        assertEquals(2, parts.size)
        assertEquals(at("2026-07-28T02:00"), parts[0].end)
        assertEquals(at("2026-07-28T02:20"), parts[1].start)
    }

    @Test
    fun `daytime nap does not stretch the band — the night is the longest session`() {
        val parts = SleepNight.of(
            listOf(
                seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"), // the night
                seg(SleepStage.LIGHT, "2026-07-28T14:00", "2026-07-28T14:40"), // a daytime nap
            ),
            wakeDate,
            msk,
        )

        assertEquals(1, parts.size)
        assertEquals(at("2026-07-28T06:00"), parts.last().end)
    }

    @Test
    fun `session that ended on another day is not this night`() {
        val parts = SleepNight.of(
            listOf(seg(SleepStage.LIGHT, "2026-07-26T23:00", "2026-07-27T07:00")),
            wakeDate,
            msk,
        )
        assertTrue(parts.isEmpty())
    }

    // --- the band's axis: minutes from 18:00 MSK the evening before ---

    @Test
    fun `band maps the night onto the evening axis`() {
        val band = SleepBand.of(SleepNight.of(night(), wakeDate, msk), wakeDate, msk)!!

        // 23:20 = 18:00 + 5h20m
        assertEquals(320, band.onsetMinute)
        // 07:20 the next day = 18:00 + 13h20m
        assertEquals(800, band.wakeMinute)
        assertEquals(460, band.asleepMinutes)
        assertEquals(320, band.parts.first().fromMinute)
        assertEquals(800, band.parts.last().toMinute)
    }

    @Test
    fun `band parts carry their stage in lower case for the client`() {
        val band = SleepBand.of(SleepNight.of(night(), wakeDate, msk), wakeDate, msk)!!
        assertEquals("light", band.parts.first().stage)
        assertTrue(band.parts.any { it.stage == "awake" })
    }

    @Test
    fun `an early bird before the axis start is clamped, not wrapped around`() {
        // Asleep at 17:30, before the axis starts. The band must begin at zero, not run off the end.
        val band = SleepBand.of(
            SleepNight.of(
                listOf(seg(SleepStage.LIGHT, "2026-07-27T17:30", "2026-07-28T02:00")),
                wakeDate,
                msk,
            ),
            wakeDate,
            msk,
        )!!
        assertEquals(0, band.onsetMinute)
        assertEquals(480, band.wakeMinute)
    }

    @Test
    fun `no chunks means no band at all, not an empty one`() {
        assertNull(SleepBand.of(emptyList(), wakeDate, msk))
    }

}
