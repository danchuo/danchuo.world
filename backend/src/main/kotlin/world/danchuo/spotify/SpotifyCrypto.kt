package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.crypto.SecretBox

/**
 * At-rest encryption of the Spotify refresh token (PRD §8). The scheme is the core's shared box
 * ([SecretBox], AES-256-GCM); the slice supplies only its OWN key. Source keys never overlap, so
 * leaking one does not open the other.
 */
@ApplicationScoped
class SpotifyCrypto(private val config: SpotifyConfig) {

    private val box: SecretBox by lazy { SecretBox(config.tokenEncryptionKey().orElse("")) }

    fun encrypt(plain: String): String = box.encrypt(plain)

    fun decrypt(stored: String): String = box.decrypt(stored)
}
