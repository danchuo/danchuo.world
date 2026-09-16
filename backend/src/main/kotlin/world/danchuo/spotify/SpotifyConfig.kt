package world.danchuo.spotify

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Config of the Spotify source; secrets come strictly from env in prod. Credentials are `Optional`
 * because before the app is registered there are none and the slice must boot UNCONFIGURED rather
 * than fail — SmallRye reads an empty string as absent, so an empty default would not do. §8
 */
@ConfigMapping(prefix = "danchuo.spotify")
interface SpotifyConfig {

    /** Client ID of the registered Spotify app. */
    fun clientId(): Optional<String>

    /** Client Secret of the app (Basic auth on the token endpoint). */
    fun clientSecret(): Optional<String>

    /**
     * Redirect URI, exactly as registered in the Spotify app dashboard. It points at the
     * [SpotifyAuthResource] callback; `application.properties` holds a loopback default.
     */
    fun redirectUri(): Optional<String>

    /** OAuth scopes of the read-only layer: now-playing / recently-played / top. */
    @WithDefault("user-read-currently-playing user-read-recently-played user-top-read")
    fun scopes(): String

    /**
     * At-rest encryption key for the refresh token (PRD §8): Base64 of exactly 32 bytes (AES-256).
     * Generate with `openssl rand -base64 32`. From env in prod, never in a commit.
     */
    fun tokenEncryptionKey(): Optional<String>

    /**
     * Podcast listening capture (PRD §5.6). These methods exist so SmallRye `@ConfigMapping`
     * validation accepts the `danchuo.spotify.podcast.*` properties under the prefix; the interval
     * is read via a `@Scheduled` placeholder in [PodcastPoller], the rest straight from here.
     */
    fun podcast(): Podcast

    interface Podcast {
        /** Whether listening capture runs (off in `%test`, or tests would reach outside). */
        @WithDefault("true")
        fun enabled(): Boolean

        /**
         * Player poll interval (Quarkus `every` format). A minute is the compromise: the shortfall
         * at a session's start never exceeds the interval, while 1440 requests a day are
         * negligible against Spotify's limits.
         */
        @WithDefault("60s")
        fun pollInterval(): String

        /**
         * Market for catalogue requests. Without it (and without a country in the token) Spotify
         * considers the content unavailable and answers empty.
         */
        @WithDefault("RU")
        fun market(): String

        /**
         * How much silence breaks a session. A shorter pause is the same session; a longer one is
         * a new listening even for the same episode. It does not affect the day's minute total at
         * all, only whether sessions land as one row or two.
         */
        @WithDefault("15")
        fun sessionGapMinutes(): Long

        /**
         * How much of a pause still counts as the SAME sitting on the board. The storage gap above
         * is built for a once-a-minute poll and breaks a session where a person would not — lunch
         * mid-episode is not a second listen. It changes only how many cards tell a day. PRD §5.6
         */
        @WithDefault("45")
        fun runGapMinutes(): Long

        /** Summarising a listened stretch (PRD §5.16.1) — fetching the episode's text. */
        fun summary(): Summary

        interface Summary {

            /**
             * Whether fetching runs at all. Disabled it breaks nothing: the queue simply sees no
             * podcast source and the cards stay without a button (off in `%test`, or tests would
             * reach into other people's hosting).
             */
            @WithDefault("true")
            fun enabled(): Boolean

            /** The catalogue a show's RSS feed is searched in. Needs no key. */
            @WithDefault("https://itunes.apple.com")
            fun itunesUrl(): String

            /**
             * How many windows a sitting is cut into, and how long each is. Four of three minutes
             * is 720 audio seconds against a free limit of 7200 an hour, and about 9 thousand
             * transcript characters against a 12 thousand excerpt cap: both with room, no idling.
             */
            @WithDefault("4")
            fun windows(): Int

            @WithDefault("180000")
            fun windowMs(): Long

            /**
             * Cap on one audio chunk, in bytes. It keeps the request inside the provider's 25 MB
             * limit even on the densest stream: three minutes at 320 kbps is 7 MB, so the cap only
             * ever fires on something abnormal.
             */
            @WithDefault("20000000")
            fun maxSliceBytes(): Long

            @WithDefault("10")
            fun connectTimeoutSeconds(): Long

            /** Audio chunks are megabytes; minutes of waiting here are normal, not a hang. */
            @WithDefault("120")
            fun readTimeoutSeconds(): Long
        }
    }

    /**
     * Whether the slice is fully configured. While anything is missing the public GETs answer
     * empty and the OAuth flow will not start — a guard against a half-empty start.
     */
    fun isConfigured(): Boolean =
        clientId().orElse("").isNotBlank() &&
            clientSecret().orElse("").isNotBlank() &&
            redirectUri().orElse("").isNotBlank() &&
            tokenEncryptionKey().orElse("").isNotBlank()
}
