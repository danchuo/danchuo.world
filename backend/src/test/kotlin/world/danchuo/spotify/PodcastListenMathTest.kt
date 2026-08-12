package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Чистая арифметика прослушанного времени (PRD §5.6). Опрос плеера даёт положение головки,
 * и минуты считаются по ЕГО дельте, а не по числу опросов — иначе пауза и перемотка врут.
 *
 * Проверяем четыре правила без БД и без Spotify:
 * - **ровное воспроизведение**: дельта головки = дельта реального времени;
 * - **кламп по реальному времени**: перемотка вперёд не может «наслушать» больше, чем прошло;
 * - **пауза и перемотка назад**: неположительная дельта не приносит ничего;
 * - **старт сессии**: первый семпл засчитывается, только если эпизод включён с начала;
 *   продолжение с середины дало бы «наслушано» всю прошлую часть разом.
 *
 * Замер на живой сессии (15 отсчётов раз в минуту): за 845 с реального времени головка
 * прошла ровно 845 с, отдельные шаги 60/61 с. Кламп на такой ряд не срабатывает.
 */
class PodcastListenMathTest {

    private val t0: Instant = Instant.parse("2026-08-12T08:00:00Z")

    private fun tick(fromMs: Long, toMs: Long, afterSeconds: Long) =
        PodcastListenMath.tickCredit(fromMs, t0, toMs, t0.plusSeconds(afterSeconds))

    @Test
    fun `steady playback credits the progress delta`() {
        assertEquals(60_000L, tick(1_911_000, 1_971_000, 60))
    }

    @Test
    fun `progress running a second ahead of the clock is clamped to real time`() {
        // Наблюдалось живьём: шаги чередуются 60/61 с из-за округления долей секунды.
        assertEquals(60_000L, tick(1_911_000, 1_972_000, 60))
    }

    @Test
    fun `pause credits nothing`() {
        assertEquals(0L, tick(1_911_000, 1_911_000, 60))
    }

    @Test
    fun `skipping forward credits only the time actually elapsed`() {
        // Промотал пять минут рекламы за один интервал опроса — слушал всё равно минуту.
        assertEquals(60_000L, tick(1_911_000, 2_211_000, 60))
    }

    @Test
    fun `rewinding credits nothing but does not go negative`() {
        assertEquals(0L, tick(1_911_000, 1_611_000, 60))
    }

    @Test
    fun `two samples with the same timestamp credit nothing`() {
        assertEquals(0L, tick(1_911_000, 1_971_000, 0))
    }

    @Test
    fun `session opened at the very start of an episode credits what was already played`() {
        assertEquals(12_000L, PodcastListenMath.openingCredit(12_000))
    }

    @Test
    fun `session opened exactly at the tolerance still counts`() {
        assertEquals(
            PodcastListenMath.START_TOLERANCE_MS,
            PodcastListenMath.openingCredit(PodcastListenMath.START_TOLERANCE_MS),
        )
    }

    @Test
    fun `session resumed from the middle credits nothing`() {
        // Продолжил вчерашний эпизод с 20-й минуты — засчитать эти 20 минут было бы враньём.
        assertEquals(0L, PodcastListenMath.openingCredit(1_200_000))
    }
}
