package world.danchuo.core.crypto

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.Base64

/**
 * Шифрование чужих токенов at-rest (PRD §8). Ящик общий на все внешние источники: копия
 * AES-GCM во втором слайсе — худший из возможных copy-paste.
 *
 * Проверяем то, ради чего он нужен, без БД и без сети:
 * - **круг**: что зашифровали, то и расшифровали;
 * - **свежий IV на каждый вызов**: один и тот же секрет дважды не даёт одинаковый шифротекст,
 *   иначе по базе видно, что токен не менялся;
 * - **порча не проходит молча**: GCM-тег ловит правку шифротекста — это и отличает ящик от
 *   голого шифрования, где подмена вернула бы мусор под видом токена;
 * - **чужой ключ не открывает**;
 * - **ключ не того размера — отказ на входе**, а не на первом же сохранении токена.
 */
class SecretBoxTest {

    private fun key(fill: Byte): String = Base64.getEncoder().encodeToString(ByteArray(32) { fill })

    private val box = SecretBox(key(1))

    @Test
    fun `round trip returns the original secret`() {
        assertEquals("IGQVJ-token", box.decrypt(box.encrypt("IGQVJ-token")))
    }

    @Test
    fun `same secret encrypts differently every time`() {
        assertNotEquals(box.encrypt("same"), box.encrypt("same"))
    }

    @Test
    fun `tampered ciphertext is rejected, not silently decoded`() {
        val stored = Base64.getDecoder().decode(box.encrypt("IGQVJ-token"))
        stored[stored.size - 1] = (stored[stored.size - 1] + 1).toByte()
        val broken = Base64.getEncoder().encodeToString(stored)
        assertThrows(Exception::class.java) { box.decrypt(broken) }
    }

    @Test
    fun `another key cannot open the box`() {
        val stored = box.encrypt("IGQVJ-token")
        assertThrows(Exception::class.java) { SecretBox(key(2)).decrypt(stored) }
    }

    @Test
    fun `a key of the wrong length fails at construction`() {
        val short = Base64.getEncoder().encodeToString(ByteArray(16))
        assertThrows(IllegalArgumentException::class.java) { SecretBox(short).encrypt("x") }
    }
}
