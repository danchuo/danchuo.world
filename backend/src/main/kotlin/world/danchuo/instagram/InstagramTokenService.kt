package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import jakarta.ws.rs.core.MultivaluedHashMap
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import world.danchuo.core.crypto.SecretBox
import java.time.Instant

/**
 * The Instagram token lifecycle: the one-off code exchange, renewal, and handing the token to
 * readers. The exchange takes TWO steps — the first returns an HOUR-long token, and storing that
 * one would kill the source an hour after connecting. PRD §5.17
 */
@ApplicationScoped
class InstagramTokenService(
    private val config: InstagramConfig,
    private val repository: InstagramTokenRepository,
    @param:RestClient private val auth: InstagramAuthClient,
    @param:RestClient private val graph: InstagramGraphClient,
) {

    private val log: Logger = Logger.getLogger(InstagramTokenService::class.java)

    private val box: SecretBox by lazy { SecretBox(config.tokenEncryptionKey().orElse("")) }

    /** One-off OAuth: the code from the browser becomes a long-lived token in the DB. */
    @Transactional
    fun exchangeCode(code: String) {
        val form = MultivaluedHashMap<String, String>().apply {
            add("client_id", config.clientId().orElse(""))
            add("client_secret", config.clientSecret().orElse(""))
            add("grant_type", "authorization_code")
            add("redirect_uri", config.redirectUri().orElse(""))
            add("code", code)
        }
        val short = auth.exchangeCode(form)
        val shortToken = short.accessToken
            ?: error("Instagram не вернул короткий токен")
        val long = graph.exchangeLongLived("ig_exchange_token", config.clientSecret().orElse(""), shortToken)
        val longToken = long.accessToken
            ?: error("Instagram не вернул долгоживущий токен")
        val granted = short.permissions?.takeIf { it.isNotEmpty() }?.joinToString(",") ?: config.scopes()
        repository.save(box.encrypt(longToken), granted, Instant.now())
    }

    /** The decrypted token for readers. `null` when unconnected, or the token is already dead. */
    fun accessToken(now: Instant = Instant.now()): String? {
        val token = repository.current() ?: return null
        if (!InstagramTokenPolicy.isAlive(token.issuedAt, now)) {
            // A dead token is cured by nothing but the owner reconnecting: stay silent, but loudly.
            log.warn("instagram: токен просрочен — нужен повторный OAuth (/api/ingest/instagram/authorize)")
            return null
        }
        return runCatching { box.decrypt(token.encryptedAccessToken) }.getOrNull()
    }

    /**
     * Renews the token when it is due ([InstagramTokenPolicy]). In its own transaction and before
     * any feed read: a failed renewal must not cancel the post fetch, and a failed fetch must not
     * roll back a successful renewal.
     */
    @Transactional
    fun refreshIfDue(now: Instant = Instant.now()) {
        val token = repository.current() ?: return
        if (!InstagramTokenPolicy.isAlive(token.issuedAt, now)) return
        if (!InstagramTokenPolicy.needsRefresh(token.issuedAt, now)) return
        val plain = runCatching { box.decrypt(token.encryptedAccessToken) }.getOrNull() ?: return
        runCatching { graph.refresh("ig_refresh_token", plain) }
            .onFailure { log.warn("instagram: продлить токен не удалось: ${it.message}") }
            .getOrNull()
            ?.accessToken
            ?.let { repository.save(box.encrypt(it), token.scope, now) }
    }
}
