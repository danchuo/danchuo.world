package world.danchuo.telegram

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

/**
 * Config of the Telegram card; the external source lives entirely in its slice. There are no
 * secrets and can be none — the `t.me/{name}` page is public and no key exists. As with the GitHub
 * calendar, we fetch an ordinary PAGE, so the interval stays modest and the `User-Agent` honest.
 */
@ConfigMapping(prefix = "danchuo.telegram")
interface TelegramConfig {

    /** Whether the background fetch runs at all. Off simply means no card on the board. */
    @WithDefault("true")
    fun enabled(): Boolean

    /** Whose card to show. There is always exactly one on the board — the owner's. */
    @WithDefault("danchuo")
    fun username(): String

    /**
     * Fetch interval (Quarkus `every` format), read by a placeholder in
     * [TelegramProfileCollector]; the method exists so SmallRye accepts the property under the
     * prefix. An hour: name, status and avatar change more rarely than anything else here.
     */
    @WithDefault("1h")
    fun pollInterval(): String

    @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
    fun userAgent(): String
}
