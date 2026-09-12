package world.danchuo.checklist

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Пункт «Дисциплины» (PRD §5.6, §7) — data-driven: новый пункт = строка в БД, без релиза.
 *
 * Пункт **не бинарный**, а с целью-количеством [target] (растяжка = 1, чтение = 2/день,
 * подкасты = 2/день). Прогресс хранится одним числом в [ChecklistEntry] (`0..target`),
 * фронт рендерит «count/target». Пункт `monster` особый: его отметка приезжает отдельным
 * полем приёма (см. [DailyIngestService]), а не счётчиком в `items`.
 */
@Entity
@Table(name = "checklist_item")
class ChecklistItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Стабильный машинный ключ (из шортката), уникален. */
    @Column(nullable = false, unique = true)
    lateinit var key: String

    @Column(nullable = false)
    lateinit var label: String

    @Column(name = "icon")
    var icon: String? = null

    /** Цель-количество за день; для бинарных пунктов = 1. */
    @Column(nullable = false)
    var target: Int = 1

    @Column(nullable = false)
    var active: Boolean = true

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
