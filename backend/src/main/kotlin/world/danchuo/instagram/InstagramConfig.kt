package world.danchuo.instagram

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Config of the Instagram source: OAuth, token and polling stay wholly in the slice, secrets come
 * from env in prod. Credentials are `Optional` so the slice boots UNCONFIGURED before the app is
 * registered (SmallRye reads an empty string as absent). A personal account cannot connect: §5.17
 */
@ConfigMapping(prefix = "danchuo.instagram")
interface InstagramConfig {

    /** The Instagram App ID from the Meta dashboard (not the Facebook App ID). */
    fun clientId(): Optional<String>

    fun clientSecret(): Optional<String>

    /**
     * Redirect URI, exactly as allow-listed on the app. Meta accepts only https here and refuses
     * the loopback address, so the one-off OAuth is done on the live domain and the token is
     * carried into a local DB afterwards. PRD §5.17
     */
    fun redirectUri(): Optional<String>

    /**
     * Scope for reading one's own feed. `instagram_business_basic` returns media, profile and the
     * like/comment counters — everything "the latest post" needs, while any wider right would have
     * to go through App Review.
     */
    @WithDefault("instagram_business_basic")
    fun scopes(): String

    /** At-rest token encryption key (PRD §8): Base64 of exactly 32 bytes. `openssl rand -base64 32`. */
    fun tokenEncryptionKey(): Optional<String>

    /** Whether background fetching runs (off in `%test`, or tests would reach outside). */
    @WithDefault("true")
    fun enabled(): Boolean

    /**
     * Poll interval (Quarkus `every` format). Half an hour: a post appears once a day at best,
     * and Instagram allows 200 calls an hour per user, so there is no point going faster.
     */
    @WithDefault("30m")
    fun pollInterval(): String

    fun storageDir(): String

    /**
     * Whether the slice is fully configured. While anything is missing the public GET answers
     * empty and the OAuth flow will not start — a guard against a half-empty start.
     */
    fun isConfigured(): Boolean =
        clientId().orElse("").isNotBlank() &&
            clientSecret().orElse("").isNotBlank() &&
            redirectUri().orElse("").isNotBlank() &&
            tokenEncryptionKey().orElse("").isNotBlank()
}
