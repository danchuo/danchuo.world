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
 * Ночь как она была (PRD §5.4, реестр I-23): раскладка ночи по времени вместо одной суммы.
 *
 * Сумма отвечает «сколько», полоса — «как»: во сколько лёг, где провалился, в 3:40 не спал.
 * Куски приходят с ingest'а те же самые, что и раньше — разница в том, что теперь они
 * доживают до отдачи, а не схлопываются в четыре числа.
 */
class SleepNightTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")
    private val wakeDate: LocalDate = LocalDate.of(2026, 7, 28)

    private fun at(iso: String): Instant = LocalDateTime.parse(iso).atZone(msk).toInstant()

    private fun seg(stage: SleepStage, from: String, to: String) =
        SleepSegment(stage, at(from), at(to))

    /** Ночь 23:20 → 07:20 с пробуждением в 06:00 (та же, что в [SleepSessionizerTest]). */
    private fun night() = listOf(
        seg(SleepStage.LIGHT, "2026-07-27T23:20", "2026-07-27T23:50"),
        seg(SleepStage.DEEP, "2026-07-27T23:50", "2026-07-28T00:40"),
        seg(SleepStage.REM, "2026-07-28T00:40", "2026-07-28T01:40"),
        seg(SleepStage.LIGHT, "2026-07-28T01:40", "2026-07-28T06:00"),
        seg(SleepStage.AWAKE, "2026-07-28T06:00", "2026-07-28T06:20"),
        seg(SleepStage.DEEP, "2026-07-28T06:20", "2026-07-28T07:20"),
    )

    // --- сборка ночи из кусков ---

    @Test
    fun `night keeps chunks in order and keeps the awake gap visible`() {
        val parts = SleepNight.of(night(), wakeDate, msk)

        assertEquals(6, parts.size)
        assertEquals(SleepStage.LIGHT, parts.first().stage)
        assertEquals(at("2026-07-27T23:20"), parts.first().start)
        assertEquals(at("2026-07-28T07:20"), parts.last().end)
        // Пробуждение — не дырка в данных, а факт ночи: оно остаётся куском своей фазы.
        assertTrue(parts.any { it.stage == SleepStage.AWAKE && it.start == at("2026-07-28T06:00") })
    }

    @Test
    fun `overlapping sources collapse into one timeline, not a doubled night`() {
        val parts = SleepNight.of(
            listOf(
                seg(SleepStage.UNSPECIFIED, "2026-07-27T23:00", "2026-07-28T06:00"), // телефон
                seg(SleepStage.REM, "2026-07-28T01:00", "2026-07-28T02:00"), // часы поверх
            ),
            wakeDate,
            msk,
        )

        // 23:00→01:00 · 01:00→02:00 REM · 02:00→06:00 — куски идут подряд и не перекрываются
        assertEquals(3, parts.size)
        assertEquals(
            listOf(SleepStage.UNSPECIFIED, SleepStage.REM, SleepStage.UNSPECIFIED),
            parts.map { it.stage },
        )
        parts.zipWithNext().forEach { (a, b) -> assertTrue(!a.end.isAfter(b.start)) }
    }

    @Test
    fun `a night without a watch reads as light — the client has no fifth phase`() {
        // «Спал, фаза неизвестна» — это разметка телефона, а не пятая фаза: в сумме дня она
        // уже идёт в light, и полоса обязана говорить то же самое.
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
                    seg(SleepStage.AWAKE, "2026-07-27T23:00", "2026-07-27T23:30"), // лёг и ворочался
                    seg(SleepStage.LIGHT, "2026-07-27T23:30", "2026-07-28T06:00"),
                ),
                wakeDate,
                msk,
            ),
            wakeDate,
            msk,
        )!!
        assertEquals(300, band.onsetMinute) // 23:00 — лёг
        assertEquals(330, band.asleepFromMinute) // 23:30 — уснул
        assertEquals(390, band.asleepMinutes) // полчаса возни в сон не идут
    }

    @Test
    fun `a hole in the samples stays a hole — the band is not glued shut`() {
        val parts = SleepNight.of(
            listOf(
                seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T02:00"),
                // 20 минут без семплов: та же сессия, но полоса обязана показать провал
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
                seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"), // ночь
                seg(SleepStage.LIGHT, "2026-07-28T14:00", "2026-07-28T14:40"), // дневной сон
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

    // --- ось полосы: минуты от 18:00 MSK кануна ---

    @Test
    fun `band maps the night onto the evening axis`() {
        val band = SleepBand.of(SleepNight.of(night(), wakeDate, msk), wakeDate, msk)!!

        // 23:20 = 18:00 + 5ч20м
        assertEquals(320, band.onsetMinute)
        // 07:20 следующего дня = 18:00 + 13ч20м
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
        // Уснул в 17:30 — раньше начала оси. Полоса обязана начаться с нуля, а не уехать в конец.
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
