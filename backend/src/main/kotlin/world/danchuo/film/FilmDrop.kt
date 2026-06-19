package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * Фото-дроп (PRD §5.12, §7) — пачка кадров за один день, как альбом-событие. Загрузка кадров —
 * B1-админка; до неё таблица пуста. [coverPhotoId] — плоская ссылка на обложку (FK без
 * JPA-отношения, как везде в проекте). [monthLabel] — подпись «месяц год».
 */
@Entity
@Table(name = "film_drop")
class FilmDrop {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(nullable = false)
    lateinit var title: String

    @Column(name = "dropped_on", nullable = false)
    lateinit var droppedOn: LocalDate

    @Column(name = "month_label")
    var monthLabel: String? = null

    @Column(name = "photo_count", nullable = false)
    var photoCount: Int = 0

    @Column(name = "cover_photo_id")
    var coverPhotoId: Long? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant
}
