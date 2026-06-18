package world.danchuo.spotify

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import jakarta.ws.rs.core.MultivaluedHashMap
import jakarta.ws.rs.core.MultivaluedMap
import org.eclipse.microprofile.rest.client.inject.RestClient
import java.time.Instant
import java.util.Base64

/** Слайс ещё не прошёл one-time OAuth — refresh-токена в БД нет (PRD §M3). */
class SpotifyNotConnectedException : RuntimeException("spotify_not_connected")

/**
 * Жизненный цикл OAuth-токенов Spotify (PRD §M3, §8).
 *
 * - [exchangeCode] — первый обмен `code → refresh_token` (one-time, из callback);
 *   refresh-токен кладётся в БД ШИФРОВАННО ([SpotifyCrypto]).
 * - [accessToken] — выдаёт валидный access-токен: держит его в памяти до истечения
 *   и перевыпускает из refresh по требованию. Access-токен короткоживущий и нигде
 *   не персистится (§8) — только refresh лежит at-rest.
 *
 * Basic-auth (`client_id:client_secret`) на token-эндпоинте готовится здесь же.
 */
@ApplicationScoped
class SpotifyTokenService(
    @param:RestClient private val accounts: SpotifyAccountsClient,
    private val tokens: SpotifyTokenRepository,
    private val crypto: SpotifyCrypto,
    private val config: SpotifyConfig,
) {

    /** Access-токен в памяти с моментом истечения; защищён [lock]. */
    private class CachedAccess(val value: String, val expiresAt: Instant)

    @Volatile
    private var cached: CachedAccess? = null
    private val lock = Any()

    /** Подключён ли слайс (пройден ли one-time OAuth). */
    fun isConnected(): Boolean = tokens.current() != null

    /**
     * Обмен авторизационного кода на токены (callback OAuth). Сохраняет refresh-токен
     * шифрованно; сбрасывает кэш access-токена, чтобы следующий вызов взял свежий.
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
     * Валидный access-токен в формате заголовка `Bearer …`. Перевыпускает из refresh,
     * если кэш пуст/протух. Двойная проверка под локом — параллельные запросы не плодят
     * лишние рефреши.
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
     * Перевыпуск access-токена из refresh. Не `@Transactional`: зовётся из [accessToken]
     * этого же бина (self-invocation — CDI-интерцептор не сработал бы). Чтение токена идёт
     * в request-сессии; редкую ротацию refresh пишем явной транзакцией.
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
        // Spotify иногда ротирует refresh-токен — если прислал новый, перешифровываем и храним.
        res.refreshToken?.let { rotated ->
            QuarkusTransaction.requiringNew().run {
                tokens.save(crypto.encrypt(rotated), res.scope ?: row.scope)
            }
        }
        return CachedAccess(access, expiryFrom(res.expiresIn))
    }

    /** `Basic base64(client_id:client_secret)` — авторизация token-эндпоинта. */
    private fun basicAuth(): String {
        val creds = "${config.clientId().orElse("")}:${config.clientSecret().orElse("")}"
        return "Basic " + Base64.getEncoder().encodeToString(creds.toByteArray(Charsets.UTF_8))
    }

    /** Истечение с запасом [SKEW_SECONDS] на сетевой лаг/часы. */
    private fun expiryFrom(expiresIn: Long?): Instant =
        Instant.now().plusSeconds((expiresIn ?: DEFAULT_TTL_SECONDS) - SKEW_SECONDS)

    private companion object {
        const val DEFAULT_TTL_SECONDS = 3600L
        const val SKEW_SECONDS = 60L
    }
}
