package world.danchuo.checklist

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate

/**
 * One discipline mark for a day: progress is a single [count] inside the item's `0..target`.
 * Unique by (date, item_id), which is what makes ingest idempotent — a repeat updates that row
 * instead of adding another. PRD §5.6, §7
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
     * Who owns the mark: [MANUAL] (the shortcut) always outranks [DERIVED] (journal minutes,
     * podcast poller), and a derived channel may rewrite only its OWN row — otherwise the poller
     * topping up minutes all day would erase what was sent from the phone. PRD §5.6
     */
    @Column(nullable = false, length = 16)
    var source: String = MANUAL

    companion object {
        const val MANUAL = "manual"
        const val DERIVED = "derived"
    }
}
