package world.danchuo.instagram

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

/**
 * When to renew the long-lived Instagram token (PRD §5.17). It lives 60 days and renews only
 * while alive — an expired one needs the owner back through OAuth — so we renew far in advance.
 * The lower bound is Instagram's: it refuses while the token is under a day old.
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
