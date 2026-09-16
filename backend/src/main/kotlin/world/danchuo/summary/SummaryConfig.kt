package world.danchuo.summary

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

/**
 * Config of summaries, shared across every source on purpose: the excerpt ceiling and the queue's
 * tick are measured by the model's FREE LANE, which is one for all. Splitting them per slice would
 * mean configuring the same limit twice and drifting apart one day. PRD §5.16
 */
@ConfigMapping(prefix = "danchuo.summary")
interface SummaryConfig {

    /** Whether the background queue runs (off in `%test`, or it would call the model). */
    @WithDefault("true")
    fun enabled(): Boolean

    /**
     * Queue tick (Quarkus `every` format), read via a placeholder in [SummaryPoller]; the method
     * exists so `@ConfigMapping` validation accepts the property under the prefix.
     */
    @WithDefault("2m")
    fun interval(): String

    /**
     * Excerpt cap in characters. It keeps one call inside the stingiest free limit, and a longer
     * stretch is taken in windows across its whole length ([SummaryWindows]).
     */
    @WithDefault("12000")
    fun maxChars(): Int

    /** How many times a sitting is attempted before it is left without a summary. */
    @WithDefault("3")
    fun maxAttempts(): Int

    /**
     * How far, in source fractions, a sitting must move past what was told before the summary is
     * rebuilt. The default two percent: less than that is indistinguishable from rounding, and
     * zero would mean a trip to the model on every poller tick.
     */
    @WithDefault("0.02")
    fun refreshFraction(): Double
}
