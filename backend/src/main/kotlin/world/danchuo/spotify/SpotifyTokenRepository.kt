package world.danchuo.spotify

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/**
 * Доступ к синглтон-строке OAuth-кредов Spotify ([SpotifyToken]). OAuth идемпотентен:
 * [save] — upsert по фиксированному id, повтор не плодит строк.
 */
@ApplicationScoped
class SpotifyTokenRepository : PanacheRepositoryBase<SpotifyToken, Long> {

    fun current(): SpotifyToken? = findById(SpotifyToken.SINGLETON_ID)

    /** Перезаписать (или создать) единственную строку с новым refresh-токеном. */
    fun save(encryptedRefreshToken: String, scope: String) {
        val token = current() ?: SpotifyToken()
        token.encryptedRefreshToken = encryptedRefreshToken
        token.scope = scope
        token.updatedAt = Instant.now()
        persist(token)
    }
}
