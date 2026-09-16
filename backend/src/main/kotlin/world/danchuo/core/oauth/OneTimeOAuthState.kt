package world.danchuo.core.oauth

import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.util.Base64

/**
 * One-shot CSRF `state` for an external OAuth flow: authorize issues it, the callback checks and
 * burns it. In-memory and not restart-proof on purpose — a lost `state` is cured by authorizing
 * again. SUBCLASS PER SLICE: one shared bean would let Instagram clobber Spotify's state.
 */
abstract class OneTimeOAuthState {

    private val random = SecureRandom()

    @Volatile
    private var state: String? = null

    @Volatile
    private var issuedAt: Instant = Instant.EPOCH

    /** Issues a fresh `state`, wiping the previous one (one authorization at a time). */
    fun issue(): String {
        val bytes = ByteArray(STATE_BYTES).also(random::nextBytes)
        val value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        state = value
        issuedAt = Instant.now()
        return value
    }

    /**
     * Checks and burns the one-time `state`. Valid when it matches and has not expired.
     * The comparison is constant-time, so nothing leaks through timing.
     */
    fun consume(candidate: String?): Boolean {
        val current = state
        state = null // single use: any outcome clears the state
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
