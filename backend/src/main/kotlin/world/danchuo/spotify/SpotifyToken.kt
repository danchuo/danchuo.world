package world.danchuo.spotify

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Единственная строка с OAuth-кредами Spotify (PRD §M3): refresh-токен **шифрованно**
 * ([world.danchuo.spotify.SpotifyCrypto]). Один аккаунт-владелец ⇒ синглтон-строка с
 * фиксированным [id] = [SINGLETON_ID]; повторный OAuth перезаписывает её (upsert).
 *
 * Access-токен здесь не храним: он короткоживущий, держится в Caffeine-кэше и
 * перевыпускается из refresh по требованию ([SpotifyTokenService]).
 */
@Entity
@Table(name = "spotify_token")
class SpotifyToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Refresh-токен, зашифрованный AES-GCM (Base64(IV‖ct), §8). */
    @Column(name = "encrypted_refresh_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedRefreshToken: String

    /** Выданные при авторизации скоупы — для диагностики рассинхрона прав. */
    @Column(name = "scope", nullable = false)
    lateinit var scope: String

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        /** Владелец один — строка одна. */
        const val SINGLETON_ID = 1L
    }
}
