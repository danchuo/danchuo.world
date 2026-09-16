package world.danchuo.instagram

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * The single row holding Instagram's long-lived token, encrypted at rest. It stores [issuedAt]
 * rather than an expiry date: renewal returns a new token with a fresh sixty-day term, and
 * counting from issue is the only way not to drift. Unlike Spotify there is one token. PRD §5.17
 */
@Entity
@Table(name = "instagram_token")
class InstagramToken {
    @Id
    var id: Long = SINGLETON_ID

    /** Long-lived token encrypted with AES-GCM (Base64(IV||ct), §8). */
    @Column(name = "encrypted_access_token", nullable = false, columnDefinition = "TEXT")
    lateinit var encryptedAccessToken: String

    /** When the token was issued, or last renewed — its lifetime counts from here. */
    @Column(name = "issued_at", nullable = false)
    var issuedAt: Instant = Instant.EPOCH

    @Column(name = "scope", nullable = false)
    lateinit var scope: String

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH

    companion object {
        /** One owner means one row. */
        const val SINGLETON_ID = 1L
    }
}

/**
 * Access to the singleton token row ([InstagramToken]). OAuth is idempotent: [save] upserts by a
 * fixed id, so a repeat makes no extra rows.
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
