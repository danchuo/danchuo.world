package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Единственная строка с refresh-токеном Велобайка для серверного поллинга (PRD §8, §9 B4):
 * refresh-токен **шифрованно** ([VelobikeCrypto], AES-GCM), как [world.danchuo.spotify.SpotifyToken].
 *
 * Владелец один ⇒ синглтон-строка с фиксированным [id]; повторный SMS-логин перезаписывает её.
 * Access-токен (24ч) здесь не храним — он короткоживущий, держится в памяти [VelobikeTokenService]
 * и перевыпускается из refresh. Refresh живёт ~6 мес, поэтому SMS-логин нужен от владельца
 * примерно раз в полгода, а не ежедневно.
 */
@Entity
@Table(name = "velobike_token")
class VelobikeToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Refresh-токен, зашифрованный AES-GCM (Base64(IV‖ct), §8). */
    @Column(name = "encrypted_refresh_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedRefreshToken: String

    /** `external_id` клиента из JWT — для диагностики, не секрет. */
    @Column(name = "external_id")
    var externalId: String? = null

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        const val SINGLETON_ID = 1L
    }
}
