package world.danchuo.instagram

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

/**
 * Когда продлевать долгоживущий токен Instagram (PRD §5.17).
 *
 * ⚠️ **Токен живёт 60 дней и продлевается только сам собой, пока жив.** Просроченный не
 * продлить ничем — нужен новый заход владельца через OAuth. Поэтому продлеваем СИЛЬНО заранее:
 * упущенное окно стоит ручного визита, а лишний вызов не стоит ничего.
 *
 * ⚠️ **Второе ограничение — снизу:** Instagram отказывает, пока токену нет суток. Без нижнего
 * порога свежий токен, полученный в OAuth, дёргался бы на первом же такте поллера и получал
 * отказ каждый раз.
 */
class InstagramTokenPolicyTest {

    private val now: Instant = Instant.parse("2026-09-13T12:00:00Z")

    private fun issuedAgo(days: Long) = now.minus(Duration.ofDays(days))

    @Test
    fun `a token younger than a day is left alone`() {
        assertFalse(InstagramTokenPolicy.needsRefresh(issuedAgo(0), now))
    }

    @Test
    fun `a token in its quiet middle age is left alone`() {
        assertFalse(InstagramTokenPolicy.needsRefresh(issuedAgo(20), now))
    }

    @Test
    fun `a token past the renewal mark is refreshed`() {
        assertTrue(InstagramTokenPolicy.needsRefresh(issuedAgo(45), now))
    }

    @Test
    fun `renewal starts well before the sixty-day cliff`() {
        val expiresAt = issuedAgo(InstagramTokenPolicy.REFRESH_AFTER_DAYS).plus(InstagramTokenPolicy.LIFETIME)
        val margin = Duration.between(now, expiresAt)
        assertTrue(margin >= Duration.ofDays(7), "запас до обрыва меньше недели: $margin")
    }

    @Test
    fun `an expired token is not refreshable at all`() {
        assertFalse(InstagramTokenPolicy.isAlive(issuedAgo(61), now))
        assertTrue(InstagramTokenPolicy.isAlive(issuedAgo(59), now))
    }
}
