package world.danchuo.spotify

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * The single row holding Spotify's OAuth credentials, with the refresh token encrypted at rest.
 * One owner account, so a fixed [id] that a repeat OAuth overwrites. The access token is not kept
 * here: it is short-lived, cached in memory and reissued from refresh on demand. PRD §8
 */
@Entity
@Table(name = "spotify_token")
class SpotifyToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Refresh token encrypted with AES-GCM (Base64(IV||ct), §8). */
    @Column(name = "encrypted_refresh_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedRefreshToken: String

    /** Scopes granted at authorization — for diagnosing a permissions mismatch. */
    @Column(name = "scope", nullable = false)
    lateinit var scope: String

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        /** One owner means one row. */
        const val SINGLETON_ID = 1L
    }
}
