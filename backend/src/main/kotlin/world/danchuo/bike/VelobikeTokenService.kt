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

/** Слайс не прошёл SMS-логин — refresh-токена в БД нет (PRD §9 B4). */
class VelobikeNotConnectedException : RuntimeException("velobike_not_connected")

/**
 * Жизненный цикл токенов Велобайка (PRD §9 B4, §8).
 *
 * - [requestCode] / [authenticate] — SMS-логин владельца (один раз в ~6 мес, пока живёт refresh):
 *   код → токены; refresh-токен кладётся в БД ШИФРОВАННО ([VelobikeCrypto]).
 * - [bearer] — валидный `Bearer <access>`: держит access в памяти до истечения (читаем `exp`
 *   из JWT) и перевыпускает из refresh по требованию. Access (24ч) не персистится — только refresh.
 *
 * ⚠️ Обмен refresh→access реверсом **не подтверждён** (рефреш не попал в HAR): путь и формат —
 * наиболее вероятный OAuth (JSON `{refresh_token}`), вынесены в конфиг ([VelobikeConfig.refreshPath]),
 * чтобы поправить без пересборки, когда снимем точный вызов. И весь серверный контур упирается в
 * Qrator (§13) — поедет только через резидентный прокси.
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

    /** Запросить SMS-код на телефон владельца (из конфига). */
    fun requestCode(): VelobikeCodeResponse {
        val phone = config.phone().orElseThrow { IllegalStateException("danchuo.bike.phone не задан") }
        return client.requestCode(phone, config.appVersion(), config.source(), LANG)
    }

    /** Логин по коду из SMS: меняем на токены, refresh кладём шифрованно. Сбрасываем кэш access. */
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

    /** Валидный `Bearer <access>`; перевыпускает из refresh, если кэш пуст/протух (double-check под локом). */
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
        // Если refresh ротировался — перешифровываем и храним новый.
        res.refresh_token?.let { rotated ->
            QuarkusTransaction.requiringNew().run {
                tokens.save(crypto.encrypt(rotated), row.externalId)
            }
        }
        return CachedAccess("Bearer $access", expiryOf(access))
    }

    /**
     * Программный обмен refresh→access по конфиг-пути ([VelobikeConfig.refreshPath]). Вынесен из
     * MP-RestClient-интерфейса, потому что путь не подтверждён и должен правиться без пересборки.
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

    /** `external_id` из payload JWT (для диагностики). */
    private fun externalIdFrom(jwt: String?): String? =
        jwt?.let { payloadField(it, "external_id") }

    /** Истечение access из `exp` JWT с запасом [SKEW_SECONDS]; фолбэк — короткий TTL. */
    private fun expiryOf(jwt: String): Instant {
        val exp = payloadField(jwt, "exp")?.toLongOrNull()
        return if (exp != null) Instant.ofEpochSecond(exp).minusSeconds(SKEW_SECONDS)
        else Instant.now().plusSeconds(DEFAULT_TTL_SECONDS - SKEW_SECONDS)
    }

    /** Достаёт строковое/числовое поле из payload (вторая часть) JWT без проверки подписи. */
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
