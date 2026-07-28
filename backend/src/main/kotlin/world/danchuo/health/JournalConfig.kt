package world.danchuo.health

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.time.LocalTime

/**
 * Правило производной отметки «дневник перед сном» (PRD §5.6).
 *
 * Вечернее окно дня и порог минут в нём — настройка, а не константа в коде: «сколько
 * считается записью» и «когда начинается вечер» — это привычка владельца, она меняется.
 * [windowEnd] не позже [windowStart] ⇒ окно закрывается на следующих сутках (обычный случай:
 * 19:00 → 02:00). Значения — в `application.properties` под префиксом `danchuo.journal`.
 */
@ConfigMapping(prefix = "danchuo.journal")
interface JournalConfig {

    @WithDefault("19:00")
    fun windowStart(): LocalTime

    @WithDefault("02:00")
    fun windowEnd(): LocalTime

    /** Сколько минут в окне считается «дневник вёлся». */
    @WithDefault("15")
    fun minMinutes(): Int
}
