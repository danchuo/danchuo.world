package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Кадр фото-дропа (PRD §5.12, §7). [width]/[height] — размеры web-варианта (после EXIF-поворота)
 * для justified-композиции на клиенте без догадок об ориентации. [dropId] — плоский FK на
 * [FilmDrop]. Сами байты лежат в [PhotoStorage] под ключом `"{dropId}/{sortOrder}"`; URL-ы
 * вариантов (web/thumb) генерятся из ключа, поэтому путь в БД не хранится (B1).
 */
@Entity
@Table(name = "film_photo")
class FilmPhoto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "drop_id", nullable = false)
    var dropId: Long = 0

    @Column(name = "width")
    var width: Int? = null

    @Column(name = "height")
    var height: Int? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0

    /** Стабильный ключ кадра в [PhotoStorage]: `"{dropId}/{sortOrder}"`. */
    val storageKey: String get() = "$dropId/$sortOrder"
}
