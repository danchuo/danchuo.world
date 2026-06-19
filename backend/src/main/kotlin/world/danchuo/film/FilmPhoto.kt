package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Кадр фото-дропа (PRD §5.12, §7). [width]/[height] хранятся для justified-композиции на
 * клиенте (плотная раскладка «встык по швам» без догадок об ориентации). [dropId] — плоский
 * FK на [FilmDrop]. Загрузка/ресайз/превью — задача B1-админки.
 */
@Entity
@Table(name = "film_photo")
class FilmPhoto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "drop_id", nullable = false)
    var dropId: Long = 0

    @Column(name = "image_url", nullable = false)
    lateinit var imageUrl: String

    @Column(name = "width")
    var width: Int? = null

    @Column(name = "height")
    var height: Int? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
