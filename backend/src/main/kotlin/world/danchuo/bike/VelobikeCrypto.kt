package world.danchuo.bike

import jakarta.enterprise.context.ApplicationScoped
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Шифрование refresh-токена Велобайка at-rest (PRD §8): AES-256-GCM, как
 * [world.danchuo.spotify.SpotifyCrypto]. Ключ — из [VelobikeConfig.tokenEncryptionKey]
 * (Base64 32 байта). Случайный 12-байтный IV на каждое шифрование кладётся в префикс;
 * GCM-тег даёт аутентификацию. Формат хранимой строки — Base64(IV ‖ ciphertext+tag).
 *
 * (Spotify и Велобайк держат свои крипто-бины раздельно: каждый слайс владеет своим ключом
 * и его конфигом — §3.1, никаких общих провайдеров наперёд.)
 */
@ApplicationScoped
class VelobikeCrypto(private val config: VelobikeConfig) {

    private val random = SecureRandom()

    private val key: SecretKeySpec by lazy {
        val raw = Base64.getDecoder().decode(config.tokenEncryptionKey().orElse(""))
        require(raw.size == KEY_BYTES) {
            "danchuo.bike.token-encryption-key должен быть Base64 от ровно $KEY_BYTES байт (AES-256)"
        }
        SecretKeySpec(raw, "AES")
    }

    fun encrypt(plain: String): String {
        val iv = ByteArray(IV_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        }
        val ciphertext = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(iv + ciphertext)
    }

    fun decrypt(stored: String): String {
        val bytes = Base64.getDecoder().decode(stored)
        val iv = bytes.copyOfRange(0, IV_BYTES)
        val ciphertext = bytes.copyOfRange(IV_BYTES, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        }
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_BYTES = 32
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
