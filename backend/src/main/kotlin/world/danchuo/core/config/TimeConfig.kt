package world.danchuo.core.config

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.time.LocalDate
import java.time.ZoneId

/**
 * Канонические соглашения времени (PRD §4, CLAUDE.md).
 *
 * - [zone] — канонический часовой пояс (по умолчанию MSK). Все «дни», границы
 *   суток (полночь MSK) и агрегаты считаются здесь, независимо от tz сервера/гостя.
 * - [genesis] — генезис-дата danchuo.world: отсчёт данных, раньше неё — пусто.
 *
 * Значения — в `application.properties` под префиксом `danchuo.time`.
 */
@ConfigMapping(prefix = "danchuo.time")
interface TimeConfig {

    @WithDefault("Europe/Moscow")
    fun zone(): String

    fun genesis(): LocalDate

    /** Разобранный [ZoneId] канонического пояса. */
    fun zoneId(): ZoneId = ZoneId.of(zone())
}
