package world.danchuo.core.oauth

import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.util.Base64

/**
 * CSRF-`state` одноразового OAuth внешнего источника: authorize выдаёт случайный `state`,
 * callback его сверяет и гасит.
 *
 * In-memory и без переживания рестарта — поток личный и редкий (владелец подключает свой
 * аккаунт раз в несколько месяцев); потерянный при рестарте `state` лечится повторным
 * заходом на authorize.
 *
 * ⚠️ **Наследник — на слайс, а не один общий бин.** Держать одно состояние на все источники
 * нельзя: начатая авторизация Instagram затёрла бы `state` начатой авторизации Spotify, и
 * второй callback молча отказал бы. Каждый слайс объявляет свой `@ApplicationScoped`-наследник.
 */
abstract class OneTimeOAuthState {

    private val random = SecureRandom()

    @Volatile
    private var state: String? = null

    @Volatile
    private var issuedAt: Instant = Instant.EPOCH

    /** Выдать свежий `state`, затерев прежний (одна авторизация за раз). */
    fun issue(): String {
        val bytes = ByteArray(STATE_BYTES).also(random::nextBytes)
        val value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        state = value
        issuedAt = Instant.now()
        return value
    }

    /**
     * Сверить и погасить `state` (одноразовый). Валиден, если совпал и не протух.
     * Сравнение за константное время — не утекаем по таймингу.
     */
    fun consume(candidate: String?): Boolean {
        val current = state
        state = null // одноразовый: любой исход гасит state
        if (current == null || candidate == null) return false
        if (Duration.between(issuedAt, Instant.now()) > TTL) return false
        return MessageDigest.isEqual(
            current.toByteArray(Charsets.UTF_8),
            candidate.toByteArray(Charsets.UTF_8),
        )
    }

    private companion object {
        const val STATE_BYTES = 32
        val TTL: Duration = Duration.ofMinutes(10)
    }
}
