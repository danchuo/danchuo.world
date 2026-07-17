package world.danchuo.health

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Чистая нормализация сна (без БД/сети): ночь в 0 минут — это не «реальный ноль», а «сна не было»
 * (шорткат иногда шлёт 0, когда в HealthKit нет записи сна). Схлопываем такую ночь в «нет данных».
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
        // Сон был (>0), значит 0 в конкретной фазе — настоящий ноль этой фазы, не «нет данных».
        val night = SleepInput(minutes = 300, rem = 0, deep = 40, light = 260, awake = 0)
        assertEquals(night, SleepNormalization.normalize(night))
    }
}
