package world.danchuo.checklist

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate

/**
 * Отметка пункта дисциплины за день (PRD §5.6, §7). Прогресс — одно число [count]
 * в диапазоне `0..target` пункта; фронт рендерит «count/target».
 *
 * Уникальна по (date, item_id) — идемпотентность ingest: повтор за дату обновляет
 * ту же строку (upsert), а не плодит дубли. Связь с пунктом — по [itemId] (плоский
 * FK, без JPA-отношения).
 */
@Entity
@Table(name = "checklist_entry")
class ChecklistEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(nullable = false)
    lateinit var date: LocalDate

    @Column(name = "item_id", nullable = false)
    var itemId: Long = 0

    @Column(nullable = false)
    var count: Int = 0

    /**
     * Кто владеет отметкой: [MANUAL] — ручной ввод шорткатом, [DERIVED] — производный канал
     * (минуты «Журнала», поллер подкастов). Ручной ввод перекрывает производный всегда, а
     * производный правит только СВОЮ строку — иначе поллер, дописывающий минуты весь день,
     * затирал бы присланное с телефона.
     */
    @Column(nullable = false, length = 16)
    var source: String = MANUAL

    companion object {
        const val MANUAL = "manual"
        const val DERIVED = "derived"
    }
}
