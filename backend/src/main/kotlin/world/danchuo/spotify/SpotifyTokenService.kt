package world.danchuo.spotify

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import jakarta.ws.rs.core.MultivaluedHashMap
import jakarta.ws.rs.core.MultivaluedMap
import org.eclipse.microprofile.rest.client.inject.RestClient
import java.time.Instant
import java.util.Base64

/** The slice has not been through the one-time OAuth — no refresh token in the DB (PRD §M3). */
class SpotifyNotConnectedException : RuntimeException("spotify_not_connected")

/**
 * Spotify OAuth token lifecycle: [exchangeCode] does the one-time `code -> refresh_token` swap and
 * stores the refresh token ENCRYPTED, while [accessToken] keeps a valid access token in memory and
 * reissues it on demand. Only the refresh token is ever persisted. PRD §8
 */
@ApplicationScoped
class SpotifyTokenService(
    @param:RestClient private val accounts: SpotifyAccountsClient,
    private val tokens: SpotifyTokenRepository,
    private val crypto: SpotifyCrypto,
    private val config: SpotifyConfig,
) {

    /** The in-memory access token with its expiry; guarded by [lock]. */
    private class CachedAccess(val value: String, val expiresAt: Instant)

    @Volatile
    private var cached: CachedAccess? = null
    private val lock = Any()

    /** Whether the slice is connected (the one-time OAuth is done). */
    fun isConnected(): Boolean = tokens.current() != null

    /**
     * Exchanges the authorization code for tokens (the OAuth callback). Stores the refresh token
     * encrypted and drops the access-token cache, so the next call takes a fresh one.
     */
    @Transactional
    fun exchangeCode(code: String) {
        val form: MultivaluedMap<String, String> = MultivaluedHashMap<String, String>().apply {
            add("grant_type", "authorization_code")
            add("code", code)
            add("redirect_uri", config.redirectUri().orElse(""))
        }
        val res = accounts.token(basicAuth(), form)
        val refresh = res.refreshToken
            ?: error("Spotify не вернул refresh_token при обмене кода")
        tokens.save(crypto.encrypt(refresh), res.scope ?: config.scopes())
        cached = res.accessToken?.let { CachedAccess(it, expiryFrom(res.expiresIn)) }
    }

    /**
     * A valid access token in `Bearer ...` header form, reissued from the refresh when the cache
     * is empty or stale. The double check under the lock keeps parallel requests from spawning
     * redundant refreshes.
     */
    fun bearer(): String = "Bearer " + accessToken()

    private fun accessToken(): String {
        cached?.let { if (Instant.now().isBefore(it.expiresAt)) return it.value }
        synchronized(lock) {
            cached?.let { if (Instant.now().isBefore(it.expiresAt)) return it.value }
            val fresh = refreshAccessToken()
            cached = fresh
            return fresh.value
        }
    }

    /**
     * Reissues the access token from the refresh. Deliberately not `@Transactional`: it is called
     * from [accessToken] on this same bean, and a CDI interceptor would not fire on
     * self-invocation. The rare refresh rotation is written in an explicit transaction.
     */
    private fun refreshAccessToken(): CachedAccess {
        val row = tokens.current() ?: throw SpotifyNotConnectedException()
        val refresh = crypto.decrypt(row.encryptedRefreshToken)
        val form: MultivaluedMap<String, String> = MultivaluedHashMap<String, String>().apply {
            add("grant_type", "refresh_token")
            add("refresh_token", refresh)
        }
        val res = accounts.token(basicAuth(), form)
        val access = res.accessToken ?: error("Spotify не вернул access_token при рефреше")
        // Spotify sometimes rotates the refresh token — if a new one came, re-encrypt and store it.
        res.refreshToken?.let { rotated ->
            QuarkusTransaction.requiringNew().run {
                tokens.save(crypto.encrypt(rotated), res.scope ?: row.scope)
            }
        }
        return CachedAccess(access, expiryFrom(res.expiresIn))
    }

    /** `Basic base64(client_id:client_secret)` — authorization for the token endpoint. */
    private fun basicAuth(): String {
        val creds = "${config.clientId().orElse("")}:${config.clientSecret().orElse("")}"
        return "Basic " + Base64.getEncoder().encodeToString(creds.toByteArray(Charsets.UTF_8))
    }

    /** Expiry with [SKEW_SECONDS] to spare for network lag and clock drift. */
    private fun expiryFrom(expiresIn: Long?): Instant =
        Instant.now().plusSeconds((expiresIn ?: DEFAULT_TTL_SECONDS) - SKEW_SECONDS)

    private companion object {
        const val DEFAULT_TTL_SECONDS = 3600L
        const val SKEW_SECONDS = 60L
    }
}
