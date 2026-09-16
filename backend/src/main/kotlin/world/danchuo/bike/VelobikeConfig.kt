package world.danchuo.bike

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Config of the Velobike source, all under `danchuo.bike`; secrets come strictly from env in
 * prod. Server polling is OFF by default and needs a residential proxy — without one only push
 * ingest from an already-authorized browser works. PRD §13
 */
@ConfigMapping(prefix = "danchuo.bike")
interface VelobikeConfig {

    /** API base; the per-client URL is set separately (`quarkus.rest-client.velobike.url`). */
    @WithDefault("https://pwa.velobike.ru")
    fun baseUrl(): String

    /** Mandatory app headers, taken off the wire. */
    @WithDefault("4.4.30")
    fun appVersion(): String

    @WithDefault("pwa-client")
    fun source(): String

    /** Owner phone for the SMS login, formatted `79XXXXXXXXX`. From env in prod. */
    fun phone(): Optional<String>

    /**
     * At-rest encryption key for the refresh token (§8): Base64 of exactly 32 bytes (AES-256).
     * Generate with `openssl rand -base64 32`. From env in prod.
     */
    fun tokenEncryptionKey(): Optional<String>

    /**
     * Path for the refresh-to-access exchange. NOT confirmed against the real client, so it is
     * configurable and can be corrected without a rebuild once the exact endpoint is known.
     * The default is the likeliest OAuth path for the `client-oauth` issuer.
     */
    @WithDefault("api/api-auth/refresh-token")
    fun refreshPath(): String

    /** Whether the background poller runs. Off by default (needs a proxy). */
    @WithDefault("false")
    fun pollEnabled(): Boolean

    /**
     * Polling interval (Quarkus `every` format). Read through the placeholder in [VelobikePoller];
     * the method exists here so SmallRye `@ConfigMapping` validation accepts the property under
     * the `danchuo.bike` prefix.
     */
    @WithDefault("6h")
    fun pollInterval(): String

    /** History page size while polling (Spring Page). */
    @WithDefault("20")
    fun pollPageSize(): Int

    /**
     * Station geocoder (PRD §5.13). These methods exist so SmallRye `@ConfigMapping` validation
     * accepts the `danchuo.bike.geocode.*` properties under the prefix, as with [pollInterval];
     * the real reads happen through placeholders in [StationGeocoder].
     */
    fun geocode(): Geocode

    interface Geocode {
        /** Whether the background geocoder runs (off in `%test`). */
        @WithDefault("true")
        fun enabled(): Boolean

        /** Tick interval (Quarkus `every` format), read via a placeholder in [StationGeocoder]. */
        @WithDefault("5s")
        fun interval(): String

        /** `User-Agent` for Nominatim (its usage policy requires identifying the application). */
        @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
        fun userAgent(): String
    }

    /** Whether the slice is configured for server-side polling (an encryption key is present). */
    fun isConfigured(): Boolean = tokenEncryptionKey().orElse("").isNotBlank()
}
