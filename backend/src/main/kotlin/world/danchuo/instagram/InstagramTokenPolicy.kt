package world.danchuo.instagram

import java.time.Duration
import java.time.Instant

/**
 * When to renew the long-lived Instagram token — pure arithmetic, no DB and no network. Renewal
 * works only on a LIVE token, so it runs on day forty of sixty, and under a day of age Instagram
 * refuses outright. A wasted call costs nothing, a missed window costs a manual visit. PRD §5.17
 */
object InstagramTokenPolicy {

    /** How long a long-lived token lasts from its issue date. */
    val LIFETIME: Duration = Duration.ofDays(60)

    /** The day of the token's life on which renewal starts. */
    const val REFRESH_AFTER_DAYS = 40L

    /** Instagram refuses to renew sooner than a day. */
    private val MIN_AGE: Duration = Duration.ofDays(1)

    fun needsRefresh(issuedAt: Instant, now: Instant): Boolean {
        val age = Duration.between(issuedAt, now)
        return age >= MIN_AGE && age >= Duration.ofDays(REFRESH_AFTER_DAYS)
    }

    /** Whether the token is alive at all — a dead one cannot be renewed, only replaced by OAuth. */
    fun isAlive(issuedAt: Instant, now: Instant): Boolean =
        Duration.between(issuedAt, now) < LIFETIME
}
