package world.danchuo.spotify

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/**
 * Access to the singleton row of Spotify OAuth credentials ([SpotifyToken]). OAuth is idempotent:
 * [save] upserts by a fixed id, so a repeat makes no extra rows.
 */
@ApplicationScoped
class SpotifyTokenRepository : PanacheRepositoryBase<SpotifyToken, Long> {

    fun current(): SpotifyToken? = findById(SpotifyToken.SINGLETON_ID)

    /** Overwrites (or creates) the single row with a new refresh token. */
    fun save(encryptedRefreshToken: String, scope: String) {
        val token = current() ?: SpotifyToken()
        token.encryptedRefreshToken = encryptedRefreshToken
        token.scope = scope
        token.updatedAt = Instant.now()
        persist(token)
    }
}
