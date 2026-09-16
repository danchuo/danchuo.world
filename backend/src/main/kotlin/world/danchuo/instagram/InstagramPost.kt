package world.danchuo.instagram

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * The owner's latest post as a singleton row — the board shows exactly one and needs no history.
 * The image is NOT kept as an Instagram link (signed, dead within hours): the bytes are taken
 * locally, and [mediaId] is what says the post changed, since the URL churns by itself. §5.17
 */
@Entity
@Table(name = "instagram_post")
class InstagramPost {
    @Id
    var id: Long = SINGLETON_ID

    /** Instagram media id — how we tell that the post has changed. */
    @Column(name = "media_id", nullable = false)
    lateinit var mediaId: String

    @Column(name = "permalink", nullable = false)
    lateinit var permalink: String

    @Column(name = "caption", columnDefinition = "TEXT")
    var caption: String? = null

    /** `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM` — as Instagram names them. */
    @Column(name = "media_type", nullable = false)
    lateinit var mediaType: String

    @Column(name = "like_count")
    var likeCount: Int? = null

    @Column(name = "comments_count")
    var commentsCount: Int? = null

    /** When the post was published (not when we fetched it). */
    @Column(name = "posted_at", nullable = false)
    var postedAt: Instant = Instant.EPOCH

    @Column(name = "username", nullable = false)
    lateinit var username: String

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.EPOCH

    companion object {
        const val SINGLETON_ID = 1L
    }
}

@ApplicationScoped
class InstagramPostRepository : PanacheRepositoryBase<InstagramPost, Long> {

    fun current(): InstagramPost? = findById(InstagramPost.SINGLETON_ID)
}
