package world.danchuo.core.config

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.time.LocalDate
import java.time.ZoneId

/**
 * Canonical time settings, held under `danchuo.time`: [zone] is the timezone (MSK) in which every
 * day, midnight boundary and aggregate is computed regardless of the server's, and [genesis] is
 * where the data starts — before it, everything is empty. PRD §4
 */
@ConfigMapping(prefix = "danchuo.time")
interface TimeConfig {

    @WithDefault("Europe/Moscow")
    fun zone(): String

    fun genesis(): LocalDate

    fun zoneId(): ZoneId = ZoneId.of(zone())
}
