package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pure sleep normalisation, no DB or network: a night of 0 minutes is not a real zero but "no
 * sleep recorded" (the shortcut sends 0 when HealthKit has nothing), so it collapses to no data.
 */
class SleepNormalizationTest {

    @Test
    fun `ноль минут сна схлопывается в null вместе с фазами`() {
        val out = SleepNormalization.normalize(
            SleepInput(minutes = 0, rem = 0, deep = 0, light = 0, awake = 0),
        )
        assertEquals(SleepInput(null, null, null, null, null), out)
    }

    @Test
    fun `ноль минут сна гасит и пришедшие ненулевые фазы (сессии не было)`() {
        val out = SleepNormalization.normalize(
            SleepInput(minutes = 0, rem = 12, deep = 0, light = 0, awake = 8),
        )
        assertEquals(SleepInput(null, null, null, null, null), out)
    }

    @Test
    fun `реальная ночь не трогается`() {
        val night = SleepInput(minutes = 437, rem = 92, deep = 61, light = 264, awake = 20)
        assertEquals(night, SleepNormalization.normalize(night))
    }

    @Test
    fun `отсутствующий сон (null) остаётся null, фазы не выдумываются`() {
        val out = SleepNormalization.normalize(
            SleepInput(minutes = null, rem = null, deep = null, light = null, awake = null),
        )
        assertEquals(SleepInput(null, null, null, null, null), out)
    }

    @Test
    fun `ненулевая длительность с нулём в отдельной фазе — фаза остаётся реальным нулём`() {
        // Sleep happened (>0), so a 0 in one phase is that phase's real zero, not missing data.
        val night = SleepInput(minutes = 300, rem = 0, deep = 40, light = 260, awake = 0)
        assertEquals(night, SleepNormalization.normalize(night))
    }
}
