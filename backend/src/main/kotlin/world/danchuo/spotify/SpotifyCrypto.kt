package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Шифрование refresh-токена at-rest (PRD §8, §M3): AES-256-GCM. Ключ — из конфига
 * ([SpotifyConfig.tokenEncryptionKey], Base64 32 байта). Случайный 12-байтный IV
 * генерится на каждое шифрование и кладётся в префикс; GCM-тег даёт аутентификацию
 * (порча шифротекста ⇒ исключение при расшифровке).
 *
 * Формат хранимой строки — Base64(IV ‖ ciphertext+tag). Живёт в слайсе: ядро про
 * шифрование внешних токенов не знает.
 */
@ApplicationScoped
class SpotifyCrypto(private val config: SpotifyConfig) {

    private val random = SecureRandom()

    /** Ключ читаем лениво: до конфигурации слайса шифрование и не вызывается. */
    private val key: SecretKeySpec by lazy {
        val raw = Base64.getDecoder().decode(config.tokenEncryptionKey().orElse(""))
        require(raw.size == KEY_BYTES) {
            "danchuo.spotify.token-encryption-key должен быть Base64 от ровно $KEY_BYTES байт (AES-256)"
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
