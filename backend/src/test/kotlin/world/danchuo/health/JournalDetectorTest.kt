package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * Раскладка минут «осознанности» по вечерним окнам (PRD §5.6).
 *
 * Пункт «дневник» ставится не галочкой, а временем в приложении «Журнал»: оно приходит
 * с HealthKit кусками (как сон) и попадает в **вечернюю корзину** дня — окно 19:00 → 02:00
 * следующих суток. Календарная полночь тут не граница: запись в 00:40 закрывает уходящий день.
 */
class JournalDetectorTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")
    private val from: LocalTime = LocalTime.of(19, 0)
    private val to: LocalTime = LocalTime.of(2, 0)

    private fun at(iso: String): Instant =
        LocalDateTime.parse(iso).atZone(msk).toInstant()

    private fun seg(start: String, end: String) = MindfulSegment(at(start), at(end))

    private fun minutes(vararg segments: MindfulSegment): Map<LocalDate, Int> =
        JournalDetector.minutesByDay(segments.toList(), from, to, msk)

    private fun day(d: String) = LocalDate.parse(d)

    @Test
    fun `evening session lands on its own day`() {
        val byDay = minutes(seg("2026-07-27T21:04", "2026-07-27T21:26"))

        assertEquals(22, byDay[day("2026-07-27")])
        assertEquals(1, byDay.size)
    }

    @Test
    fun `session crossing midnight stays on the day it belongs to, whole`() {
        // Уснуть не успел, дописывал в дневнике через полночь: календарные сутки сменились,
        // «день» — нет. Разрежь мы по полуночи, вечер бы делился надвое и порог не набирался.
        val byDay = minutes(seg("2026-07-27T23:40", "2026-07-28T00:20"))

        assertEquals(40, byDay[day("2026-07-27")])
        assertNull(byDay[day("2026-07-28")])
    }

    @Test
    fun `after-midnight session belongs to the previous day`() {
        val byDay = minutes(seg("2026-07-28T01:10", "2026-07-28T01:40"))

        assertEquals(30, byDay[day("2026-07-27")])
        assertNull(byDay[day("2026-07-28")])
    }

    @Test
    fun `session is clipped to the window edges, not counted whole`() {
        // Дневник открыт с 18:30 — до окна засчитывать нечего, иначе дневное сидение
        // в приложении вытянуло бы вечернюю галочку.
        val byDay = minutes(seg("2026-07-27T18:30", "2026-07-27T19:20"))

        assertEquals(20, byDay[day("2026-07-27")])
    }

    @Test
    fun `session running past the closing edge is clipped too`() {
        val byDay = minutes(seg("2026-07-28T01:40", "2026-07-28T02:30"))

        assertEquals(20, byDay[day("2026-07-27")])
    }

    @Test
    fun `daytime session is outside every window`() {
        val byDay = minutes(seg("2026-07-27T14:00", "2026-07-27T15:00"))

        assertTrue(byDay.isEmpty())
    }

    @Test
    fun `overlapping duplicates do not double-count`() {
        // Shortcuts не дедуплицирует семплы: та же грабля, что удваивала ночь до сессионизации.
        val byDay = minutes(
            seg("2026-07-27T21:00", "2026-07-27T21:30"),
            seg("2026-07-27T21:10", "2026-07-27T21:40"),
        )

        assertEquals(40, byDay[day("2026-07-27")])
    }

    @Test
    fun `one wide pull fills two evening buckets at once`() {
        // Ради этого шорткат и тащит 34 часа: полуночный прогон дозакрывает вчерашний день.
        val byDay = minutes(
            seg("2026-07-26T20:00", "2026-07-26T20:25"),
            seg("2026-07-27T21:00", "2026-07-27T21:16"),
        )

        assertEquals(25, byDay[day("2026-07-26")])
        assertEquals(16, byDay[day("2026-07-27")])
    }

    @Test
    fun `fragmented chunks of one evening add up, daytime ones stay out`() {
        // Форма живых данных: «Журнал» пишет не одну сессию, а россыпь коротких кусков с
        // паузами (открыл-закрыл-вернулся). Группировать их в сессии, как сон, не нужно —
        // вопрос «сколько всего минут за вечер», поэтому просто сумма внутри окна.
        val byDay = minutes(
            seg("2026-07-09T13:24:42", "2026-07-09T13:25:43"),
            seg("2026-07-09T16:45:17", "2026-07-09T16:50:02"),
            seg("2026-07-09T22:49:52", "2026-07-09T22:52:45"),
            seg("2026-07-09T22:53:23", "2026-07-09T22:56:58"),
        )

        // 2:53 + 3:35 = 6:28 ⇒ 6 минут; дневные куски в вечернюю корзину не попадают вовсе
        assertEquals(6, byDay[day("2026-07-09")])
        assertEquals(1, byDay.size)
    }

    @Test
    fun `empty and degenerate input yields nothing`() {
        assertTrue(JournalDetector.minutesByDay(emptyList(), from, to, msk).isEmpty())
        assertTrue(minutes(seg("2026-07-27T21:00", "2026-07-27T21:00")).isEmpty())
        assertTrue(minutes(seg("2026-07-27T21:30", "2026-07-27T21:00")).isEmpty())
    }
}
