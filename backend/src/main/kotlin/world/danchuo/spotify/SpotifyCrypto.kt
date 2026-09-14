package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.crypto.SecretBox

/**
 * Шифрование refresh-токена Spotify at-rest (PRD §8, §M3). Схема — общий ящик ядра
 * ([SecretBox], AES-256-GCM); слайс даёт только СВОЙ ключ ([SpotifyConfig.tokenEncryptionKey],
 * Base64 32 байта). Ключи источников не пересекаются: утечка одного не открывает второй.
 */
@ApplicationScoped
class SpotifyCrypto(private val config: SpotifyConfig) {

    private val box: SecretBox by lazy { SecretBox(config.tokenEncryptionKey().orElse("")) }

    fun encrypt(plain: String): String = box.encrypt(plain)

    fun decrypt(stored: String): String = box.decrypt(stored)
}
