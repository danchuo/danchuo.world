package world.danchuo.reading

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Config of the reading slice: the external source is the Anx Reader shelf the phone syncs onto
 * our WebDAV, and all parsing stays here. The path is `Optional` so an unconfigured shelf leaves
 * the slice silent instead of failing — SmallRye reads an empty string as absent. PRD §5.16
 */
@ConfigMapping(prefix = "danchuo.reading")
interface ReadingConfig {

    /**
     * Shelf root: the directory the WebDAV server writes the reader's uploads into. Inside are
     * `anx/database<N>.db` and `anx/data/{file,cover}/...`; we read only the DB and the covers.
     */
    fun shelfDir(): Optional<String>

    /** Whether background stat collection runs (off in `%test`, or the poller writes past fixtures). */
    @WithDefault("true")
    fun enabled(): Boolean

    /**
     * Shelf poll interval (Quarkus `every` format), read via a placeholder in [ReadingPoller];
     * the method exists so `@ConfigMapping` validation accepts the property under the prefix.
     */
    @WithDefault("5m")
    fun pollInterval(): String

    /**
     * The pause after which reading counts as a new session rather than a continuation. 45 minutes
     * by default: two half-hour sittings in one evening must stay two rows, while a phone put down
     * for five minutes stays one.
     */
    @WithDefault("45")
    fun sessionGapMinutes(): Long

    /**
     * Threshold below which no new session starts: opening a book to glance at it is not reading.
     * An already open session is untouched by it. No seconds are lost — credit is the difference
     * against what is recorded, so a short remainder waits and arrives whole ([ReadingSessionMath]).
     */
    @WithDefault("60")
    fun minSessionSeconds(): Int

    /**
     * Whether the shelf is configured; an empty path leaves the slice silent, which is a normal
     * state rather than a fault. Summarising what was read is configured elsewhere
     * (`danchuo.summary.*`): its ceilings are measured by the shared free lane, not by the shelf.
     */
    fun isConfigured(): Boolean = shelfDir().isPresent && shelfDir().get().isNotBlank()
}
