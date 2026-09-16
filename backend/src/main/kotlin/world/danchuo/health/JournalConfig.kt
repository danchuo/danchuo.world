package world.danchuo.health

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.time.LocalTime

/**
 * The rule behind the derived "journal before sleep" mark: the evening window and its minute
 * threshold are settings rather than constants — both are the owner's habit and do change.
 * [windowEnd] not after [windowStart] means the window closes next day (19:00 -> 02:00). §5.6
 */
@ConfigMapping(prefix = "danchuo.journal")
interface JournalConfig {

    @WithDefault("19:00")
    fun windowStart(): LocalTime

    @WithDefault("02:00")
    fun windowEnd(): LocalTime

    /** How many minutes in the window count as "the journal was kept". */
    @WithDefault("15")
    fun minMinutes(): Int
}
