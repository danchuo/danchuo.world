package world.danchuo.bike

import com.fasterxml.jackson.databind.ObjectMapper
import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import jakarta.ws.rs.client.ClientBuilder
import jakarta.ws.rs.client.Entity
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RestClient
import java.time.Instant
import java.util.Base64

/** The slice never completed the SMS login — no refresh token in the DB (PRD §9 B4). */
class VelobikeNotConnectedException : RuntimeException("velobike_not_connected")

/**
 * Velobike token lifecycle: SMS login stores the refresh token encrypted, [bearer] keeps the 24h
 * access token in memory and reissues it from refresh. The refresh-to-access path is UNCONFIRMED
 * (never captured), so it is config ([VelobikeConfig.refreshPath]), not code. PRD §9 B4, §13
 */
@ApplicationScoped
class VelobikeTokenService(
    @param:RestClient private val client: VelobikeClient,
    private val tokens: VelobikeTokenRepository,
    private val crypto: VelobikeCrypto,
    private val config: VelobikeConfig,
    private val mapper: ObjectMapper,
) {

    private class CachedAccess(val value: String, val expiresAt: Instant)

    @Volatile
    private var cached: CachedAccess? = null
    private val lock = Any()

    fun isConnected(): Boolean = tokens.current() != null

    /** Request an SMS code to the owner's phone (from config). */
    fun requestCode(): VelobikeCodeResponse {
        val phone = config.phone().orElseThrow { IllegalStateException("danchuo.bike.phone не задан") }
        return client.requestCode(phone, config.appVersion(), config.source(), LANG)
    }

    /** Login by SMS code: exchange for tokens, store the refresh encrypted, drop the access cache. */
    @Transactional
    fun authenticate(code: String) {
        val phone = config.phone().orElseThrow { IllegalStateException("danchuo.bike.phone не задан") }
        val res = client.authenticate(
            VelobikeAuthRequest(user = phone, password = code),
            config.appVersion(), config.source(), LANG,
        )
        val refresh = res.refresh_token ?: error("Велобайк не вернул refresh_token при логине")
        tokens.save(crypto.encrypt(refresh), externalIdFrom(res.access_token))
        cached = res.access_token?.let { CachedAccess("Bearer $it", expiryOf(it)) }
    }

    /** A valid `Bearer <access>`, reissued from the refresh when the cache is empty or stale. */
    fun bearer(): String {
        cached?.let { if (Instant.now().isBefore(it.expiresAt)) return it.value }
        synchronized(lock) {
            cached?.let { if (Instant.now().isBefore(it.expiresAt)) return it.value }
            val fresh = refreshAccess()
            cached = fresh
            return fresh.value
        }
    }

    private fun refreshAccess(): CachedAccess {
        val row = tokens.current() ?: throw VelobikeNotConnectedException()
        val refresh = crypto.decrypt(row.encryptedRefreshToken)
        val res = exchangeRefresh(refresh)
        val access = res.access_token ?: error("Велобайк не вернул access_token при рефреше")
        // If the refresh rotated, re-encrypt and store the new one.
        res.refresh_token?.let { rotated ->
            QuarkusTransaction.requiringNew().run {
                tokens.save(crypto.encrypt(rotated), row.externalId)
            }
        }
        return CachedAccess("Bearer $access", expiryOf(access))
    }

    /**
     * Refresh-to-access exchange over the configured path ([VelobikeConfig.refreshPath]). Kept out
     * of the MP RestClient interface because that path is unconfirmed and must be fixable without
     * a rebuild.
     */
    private fun exchangeRefresh(refreshToken: String): VelobikeAuthResponse {
        val target = ClientBuilder.newClient()
        try {
            val resp = target.target(config.baseUrl()).path(config.refreshPath())
                .request(MediaType.APPLICATION_JSON)
                .header("App-version", config.appVersion())
                .header("source", config.source())
                .header("lang", LANG)
                .post(Entity.json(mapOf("refresh_token" to refreshToken)))
            resp.use {
                val text = it.readEntity(String::class.java)
                return mapper.readValue(text, VelobikeAuthResponse::class.java)
            }
        } finally {
            target.close()
        }
    }

    /** `external_id` from the JWT payload (diagnostics). */
    private fun externalIdFrom(jwt: String?): String? =
        jwt?.let { payloadField(it, "external_id") }

    /** Access expiry from the JWT `exp` less [SKEW_SECONDS]; falls back to a short TTL. */
    private fun expiryOf(jwt: String): Instant {
        val exp = payloadField(jwt, "exp")?.toLongOrNull()
        return if (exp != null) Instant.ofEpochSecond(exp).minusSeconds(SKEW_SECONDS)
        else Instant.now().plusSeconds(DEFAULT_TTL_SECONDS - SKEW_SECONDS)
    }

    /** Pulls a string or numeric field out of the JWT payload without verifying the signature. */
    private fun payloadField(jwt: String, field: String): String? = runCatching {
        val payload = jwt.split(".")[1]
        val json = String(Base64.getUrlDecoder().decode(payload.padBase64()), Charsets.UTF_8)
        mapper.readTree(json).get(field)?.asText()
    }.getOrNull()

    private fun String.padBase64(): String = this + "=".repeat((4 - length % 4) % 4)

    private companion object {
        const val LANG = "ru"
        const val SKEW_SECONDS = 120L
        const val DEFAULT_TTL_SECONDS = 3600L
    }
}
