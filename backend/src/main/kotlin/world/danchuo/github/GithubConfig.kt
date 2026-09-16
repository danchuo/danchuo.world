package world.danchuo.github

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

/**
 * Config of the GitHub contributions collector — the external source sits entirely in its own
 * slice. There are no secrets here and must not be: the channel is public and needs no token. We
 * fetch an ordinary PAGE, not an API, so the interval stays modest and the `User-Agent` honest.
 */
@ConfigMapping(prefix = "danchuo.github")
interface GithubConfig {

    /** Whether background collection runs. Off means the tile lives on what was already collected. */
    @WithDefault("true")
    fun enabled(): Boolean

    @WithDefault("danchuo")
    fun username(): String

    /**
     * Collection interval (Quarkus `every` format), read via a placeholder in
     * [GithubContributionCollector]; the method exists so SmallRye accepts it under the prefix.
     */
    @WithDefault("30m")
    fun pollInterval(): String

    @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
    fun userAgent(): String
}
