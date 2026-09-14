package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import jakarta.ws.rs.core.MultivaluedHashMap
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import world.danchuo.core.crypto.SecretBox
import java.time.Instant

/**
 * Жизненный цикл токена Instagram (PRD §5.17): обмен кода при разовом OAuth, продление
 * долгоживущего токена и выдача его читающим.
 *
 * ⚠️ **Обмен идёт в ДВА шага, и это не формальность.** `api.instagram.com/oauth/access_token`
 * возвращает токен на ЧАС; пригодный к делу шестидесятидневный получается вторым вызовом на
 * `graph.instagram.com/access_token`. Сохрани мы результат первого шага — источник умер бы
 * через час после подключения, причём выглядело бы это как «внезапно перестало работать».
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

    /** Разовый OAuth: код из браузера → долгоживущий токен в БД. */
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
        repository.save(box.encrypt(longToken), short.permissions ?: config.scopes(), Instant.now())
    }

    /** Расшифрованный токен для читающих. `null` — аккаунт не подключён или токен уже мёртв. */
    fun accessToken(now: Instant = Instant.now()): String? {
        val token = repository.current() ?: return null
        if (!InstagramTokenPolicy.isAlive(token.issuedAt, now)) {
            // Мёртвый токен не лечится ничем, кроме нового захода владельца: молчим, но громко.
            log.warn("instagram: токен просрочен — нужен повторный OAuth (/api/ingest/instagram/authorize)")
            return null
        }
        return runCatching { box.decrypt(token.encryptedAccessToken) }.getOrNull()
    }

    /**
     * Продлить токен, если подошёл срок ([InstagramTokenPolicy]). Отдельной транзакцией и
     * до всякого чтения ленты: неудача продления не должна отменять забор поста, а неудача
     * забора — откатывать успешное продление.
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
