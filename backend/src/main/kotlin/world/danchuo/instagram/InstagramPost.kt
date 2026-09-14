package world.danchuo.instagram

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Последний пост владельца (PRD §5.17) — синглтон-строка: на борде показывается ровно один,
 * история постов никому здесь не нужна.
 *
 * ⚠️ **Картинка НЕ хранится ссылкой на Instagram.** `media_url` из API — подписанный URL с
 * зашитым сроком: через несколько часов CDN отвечает 403 «URL signature expired», и карточка
 * на борде тихо пустеет. Поэтому байты снимаются себе ([InstagramImageStorage]), а наружу
 * уходит свой адрес. Отсюда же [mediaId]: по нему видно, что пост сменился и картинку надо
 * перекачать, — сам URL меняется и у того же поста, так что сравнивать по нему нельзя.
 */
@Entity
@Table(name = "instagram_post")
class InstagramPost {
    @Id
    var id: Long = SINGLETON_ID

    /** Идентификатор медиа в Instagram — по нему видно, что пост сменился. */
    @Column(name = "media_id", nullable = false)
    lateinit var mediaId: String

    @Column(name = "permalink", nullable = false)
    lateinit var permalink: String

    @Column(name = "caption", columnDefinition = "TEXT")
    var caption: String? = null

    /** `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM` — как их называет Instagram. */
    @Column(name = "media_type", nullable = false)
    lateinit var mediaType: String

    @Column(name = "like_count")
    var likeCount: Int? = null

    @Column(name = "comments_count")
    var commentsCount: Int? = null

    /** Когда пост опубликован (не когда мы его забрали). */
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
