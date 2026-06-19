package world.danchuo.social

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Соцссылка (PRD §5.8, §7) — иконка + подпись + гиперссылка. Data-driven: новая = запись.
 * Порядок в блоке — [sortOrder]. [icon] — статика фронта (пиксель-иконка платформы).
 */
@Entity
@Table(name = "social_link")
class SocialLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Машинный код платформы (`github`/`telegram`/…) — для дефолтной иконки на фронте. */
    @Column(nullable = false)
    lateinit var platform: String

    /** Человекочитаемая подпись ссылки. */
    @Column(nullable = false)
    lateinit var name: String

    @Column(nullable = false)
    lateinit var url: String

    @Column
    var icon: String? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
