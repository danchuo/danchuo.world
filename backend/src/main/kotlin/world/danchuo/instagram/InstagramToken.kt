package world.danchuo.instagram

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Единственная строка с токеном Instagram (PRD §5.17): долгоживущий токен **шифрованно**
 * ([world.danchuo.core.crypto.SecretBox]). Аккаунт-владелец один ⇒ синглтон-строка;
 * повторный OAuth перезаписывает её.
 *
 * ⚠️ Хранится [issuedAt], а не «дата протухания»: продление возвращает новый токен с новым
 * шестидесятидневным сроком, и считать от выдачи — единственный способ не разъехаться с
 * Instagram. Когда продлевать и что считается живым — [InstagramTokenPolicy].
 *
 * В отличие от Spotify пары «refresh + access» здесь нет: токен один и он же ходит в API.
 */
@Entity
@Table(name = "instagram_token")
class InstagramToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Долгоживущий токен, зашифрованный AES-GCM (Base64(IV‖ct), §8). */
    @Column(name = "encrypted_access_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedAccessToken: String

    /** Когда токен выдан (или в последний раз продлён) — от этого считается срок. */
    @Column(name = "issued_at", nullable = false)
    var issuedAt: Instant = Instant.EPOCH

    /** Выданные скоупы — для диагностики рассинхрона прав. */
    @Column(name = "scope", nullable = false)
    lateinit var scope: String

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        /** Владелец один — строка одна. */
        const val SINGLETON_ID = 1L
    }
}

/**
 * Доступ к синглтон-строке токена ([InstagramToken]). OAuth идемпотентен: [save] — upsert
 * по фиксированному id, повтор не плодит строк.
 */
@ApplicationScoped
class InstagramTokenRepository : PanacheRepositoryBase<InstagramToken, Long> {

    fun current(): InstagramToken? = findById(InstagramToken.SINGLETON_ID)

    fun save(encryptedAccessToken: String, scope: String, issuedAt: Instant) {
        val token = current() ?: InstagramToken()
        token.encryptedAccessToken = encryptedAccessToken
        token.scope = scope
        token.issuedAt = issuedAt
        token.updatedAt = Instant.now()
        persist(token)
    }
}
