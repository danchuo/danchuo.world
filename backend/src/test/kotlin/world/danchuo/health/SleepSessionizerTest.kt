package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Сессионизация сырых кусков сна (PRD §5.4, §4 «сон относится ко дню пробуждения»).
 *
 * Регрессия, из-за которой это заведено: шорткат фильтровал семплы по `End Date is today`,
 * и куски ночи, закончившиеся ДО полуночи (уснул 23:20), терялись целиком — ночь показывалась
 * «с 00:00». Здесь границы окна не решают ничего: бэк получает всё подряд и сам выбирает
 * сессию, ЗАКОНЧИВШУЮСЯ в целевой день.
 */
class SleepSessionizerTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")
    private val wakeDate: LocalDate = LocalDate.of(2026, 7, 28)

    private fun at(iso: String): Instant =
        LocalDateTime.parse(iso).atZone(msk).toInstant()

    private fun seg(stage: SleepStage, from: String, to: String) =
        SleepSegment(stage, at(from), at(to))

    private fun summarize(vararg segments: SleepSegment) =
        SleepSessionizer.summarize(segments.toList(), wakeDate, msk)

    /** Ночь 2026-07-27 23:20 → 2026-07-28 07:20, куски по обе стороны полуночи. */
    private fun night() = listOf(
        seg(SleepStage.LIGHT, "2026-07-27T23:20", "2026-07-27T23:50"), // 30 — терялся из-за End Date
        seg(SleepStage.DEEP, "2026-07-27T23:50", "2026-07-28T00:40"), // 50
        seg(SleepStage.REM, "2026-07-28T00:40", "2026-07-28T01:40"), // 60
        seg(SleepStage.LIGHT, "2026-07-28T01:40", "2026-07-28T06:00"), // 260
        seg(SleepStage.AWAKE, "2026-07-28T06:00", "2026-07-28T06:20"), // 20 — не сон
        seg(SleepStage.DEEP, "2026-07-28T06:20", "2026-07-28T07:20"), // 60
    )

    @Test
    fun `night crossing midnight is counted whole, pre-midnight chunks included`() {
        val sleep = SleepSessionizer.summarize(night(), wakeDate, msk)

        // 30 + 50 + 60 + 260 + 60 = 460 (8 часов в кровати минус 20 минут пробуждения)
        assertEquals(460, sleep.minutes)
        assertEquals(60, sleep.rem)
        assertEquals(110, sleep.deep)
        assertEquals(290, sleep.light)
        assertEquals(20, sleep.awake)
    }

    @Test
    fun `phases always add up to the reported duration`() {
        val sleep = SleepSessionizer.summarize(night(), wakeDate, msk)
        assertEquals(sleep.minutes, sleep.rem!! + sleep.deep!! + sleep.light!!)
    }

    @Test
    fun `awake is excluded from duration but kept as its own phase`() {
        val sleep = summarize(
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T05:00"), // 360
            seg(SleepStage.AWAKE, "2026-07-28T05:00", "2026-07-28T05:30"), // 30
        )
        assertEquals(360, sleep.minutes)
        assertEquals(30, sleep.awake)
    }

    @Test
    fun `session that ended yesterday does not leak into today`() {
        val sleep = summarize(
            // позапрошлая ночь — закончилась 27-го, целевой день 28-й
            seg(SleepStage.LIGHT, "2026-07-26T23:00", "2026-07-27T07:00"), // 480
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"), // 420
        )
        assertEquals(420, sleep.minutes)
    }

    @Test
    fun `daytime nap of the same day adds up — it is a session that also ended today`() {
        val sleep = summarize(
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"), // 420
            seg(SleepStage.LIGHT, "2026-07-28T14:00", "2026-07-28T14:40"), // 40
        )
        assertEquals(460, sleep.minutes)
    }

    @Test
    fun `duplicate samples from two sources do not double the night`() {
        val sleep = summarize(
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"),
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"), // тот же интервал вторым источником
        )
        assertEquals(420, sleep.minutes)
        assertEquals(420, sleep.light)
    }

    @Test
    fun `watch phase wins over phone unspecified on the same stretch`() {
        val sleep = summarize(
            seg(SleepStage.UNSPECIFIED, "2026-07-27T23:00", "2026-07-28T06:00"), // телефон: просто «спит»
            seg(SleepStage.REM, "2026-07-28T01:00", "2026-07-28T02:00"), // часы: фаза поверх
        )
        assertEquals(420, sleep.minutes) // время не удваивается
        assertEquals(60, sleep.rem)
        assertEquals(360, sleep.light) // неразмеченное идёт в light
    }

    @Test
    fun `night without a watch is one unspecified sample and still counts`() {
        val sleep = summarize(
            seg(SleepStage.UNSPECIFIED, "2026-07-27T23:10", "2026-07-28T07:10"),
        )
        assertEquals(480, sleep.minutes)
        assertEquals(480, sleep.light)
        assertEquals(0, sleep.rem)
    }

    @Test
    fun `no segments at all means no data, not a zero night`() {
        val sleep = SleepSessionizer.summarize(emptyList(), wakeDate, msk)
        assertNull(sleep.minutes)
        assertNull(sleep.rem)
        assertNull(sleep.awake)
    }

    @Test
    fun `only awake means no sleep — everything is null`() {
        val sleep = summarize(seg(SleepStage.AWAKE, "2026-07-28T03:00", "2026-07-28T03:20"))
        assertNull(sleep.minutes)
        assertNull(sleep.awake)
    }

    @Test
    fun `zero-length and reversed segments are ignored`() {
        val sleep = summarize(
            seg(SleepStage.LIGHT, "2026-07-28T02:00", "2026-07-28T02:00"),
            seg(SleepStage.LIGHT, "2026-07-28T05:00", "2026-07-28T04:00"),
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T06:00"),
        )
        assertEquals(420, sleep.minutes)
    }

    @Test
    fun `short gaps stay inside one session, a long gap splits it`() {
        val sleep = summarize(
            seg(SleepStage.LIGHT, "2026-07-27T23:00", "2026-07-28T02:00"), // 180
            // 20 минут «дырки» в семплах — та же ночь
            seg(SleepStage.LIGHT, "2026-07-28T02:20", "2026-07-28T06:00"), // 220
        )
        assertEquals(400, sleep.minutes)
    }

    // --- разбор имён фаз (голые строки iOS Shortcuts) ---

    @Test
    fun `stage names map the way HealthKit writes them`() {
        assertEquals(SleepStage.REM, SleepStage.of("REM"))
        assertEquals(SleepStage.REM, SleepStage.of("asleepREM"))
        assertEquals(SleepStage.DEEP, SleepStage.of("Deep"))
        assertEquals(SleepStage.LIGHT, SleepStage.of("Core")) // маппинг §7: asleepCore = light
        assertEquals(SleepStage.LIGHT, SleepStage.of("asleepCore"))
        assertEquals(SleepStage.AWAKE, SleepStage.of("Awake"))
        assertEquals(SleepStage.UNSPECIFIED, SleepStage.of("Asleep")) // ночь без часов
    }

    @Test
    fun `in-bed is not sleep and unknown stages are skipped`() {
        assertNull(SleepStage.of("In Bed"))
        assertNull(SleepStage.of("inBed"))
        assertNull(SleepStage.of("something-new"))
        assertNull(SleepStage.of(null))
        assertNull(SleepStage.of(" "))
    }

    // --- разбор дат ---

    @Test
    fun `timestamps parse with offset, without offset and with a space separator`() {
        val expected = at("2026-07-27T23:20")
        assertEquals(expected, SleepSessionizer.parseInstant("2026-07-27T23:20:00+03:00", msk))
        assertEquals(expected, SleepSessionizer.parseInstant("2026-07-27T23:20:00", msk))
        assertEquals(expected, SleepSessionizer.parseInstant("2026-07-27T23:20", msk))
        assertEquals(expected, SleepSessionizer.parseInstant("2026-07-27 23:20:00", msk))
        assertEquals(expected, SleepSessionizer.parseInstant("2026-07-27T20:20:00Z", msk))
    }

    @Test
    fun `garbage timestamps are rejected, not guessed`() {
        assertNull(SleepSessionizer.parseInstant("27.07.2026 23:20", msk))
        assertNull(SleepSessionizer.parseInstant("", msk))
        assertNull(SleepSessionizer.parseInstant(null, msk))
    }
}
