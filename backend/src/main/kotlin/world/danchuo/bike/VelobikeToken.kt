package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * The single row holding Velobike's refresh token, encrypted at rest ([VelobikeCrypto]) like
 * [world.danchuo.spotify.SpotifyToken]. One owner, so a fixed [id] that a new SMS login
 * overwrites; the 24h access token is short-lived and stays in memory only. PRD §8
 */
@Entity
@Table(name = "velobike_token")
class VelobikeToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Refresh token encrypted with AES-GCM (Base64(IV||ct), §8). */
    @Column(name = "encrypted_refresh_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedRefreshToken: String

    /** Client `external_id` from the JWT — diagnostics, not a secret. */
    @Column(name = "external_id")
    var externalId: String? = null

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        const val SINGLETON_ID = 1L
    }
}
