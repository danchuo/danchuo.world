package world.danchuo.monster

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Вкус энергетика «монстра» (PRD §5.6, §7; DESIGN §6) — data-driven сущность.
 *
 * Новый вкус добавляется **записью в БД** (сид/API), без релиза. У каждого вкуса
 * есть [accentColor] для пиксель-метки дня в календаре и банка-картинка [imageUrl]
 * для плитки «Сегодня». «Монстр дня» = выбранный вкус либо «не пил» (см. checklist).
 *
 * Связь с днём — по плоскому `monster_flavor_id` в `day_record` (без JPA-отношения,
 * чтобы слайсы оставались расцеплены); ссылочную целостность держит FK в миграции.
 */
@Entity
@Table(name = "monster_flavor")
class MonsterFlavor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Стабильный машинный ключ (из шортката), уникален. */
    @Column(nullable = false, unique = true)
    lateinit var key: String

    @Column(nullable = false)
    lateinit var name: String

    @Column(name = "image_url", nullable = false)
    lateinit var imageUrl: String

    /** Акцент-цвет дня (hex), опционален — иначе день нейтральный. */
    @Column(name = "accent_color")
    var accentColor: String? = null

    @Column(nullable = false)
    var active: Boolean = true

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
