package world.danchuo.core.crypto

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Шифрование чужого токена at-rest (PRD §8): AES-256-GCM под ключом слайса.
 *
 * Ящик общий на все внешние источники и живёт в ядре, хотя сами токены — дело слайсов:
 * ключ у каждого источника свой и приезжает параметром, а вот сама схема шифрования
 * размножаться по слайсам не должна. Копия криптокода — худший из возможных copy-paste:
 * правка (смена режима, длины IV, порядка полей) обязана быть ровно в одном месте.
 *
 * Формат хранимой строки — `Base64(IV ‖ ciphertext+tag)`. IV случайный на КАЖДОЕ шифрование:
 * при фиксированном IV повтор того же секрета даёт тот же шифротекст, и по базе видно, что
 * токен не менялся. GCM-тег даёт аутентификацию — порча шифротекста роняет расшифровку,
 * а не возвращает мусор под видом токена.
 *
 * ⚠️ Ключ разбирается ЛЕНИВО: слайс без кред обязан подниматься «не сконфигурированным»,
 * а не падать на старте (`isConfigured()` у конфигов источников).
 */
class SecretBox(private val base64Key: String) {

    private val random = SecureRandom()

    private val key: SecretKeySpec by lazy {
        val raw = Base64.getDecoder().decode(base64Key)
        require(raw.size == KEY_BYTES) {
            "ключ шифрования токена должен быть Base64 от ровно $KEY_BYTES байт (AES-256)"
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
