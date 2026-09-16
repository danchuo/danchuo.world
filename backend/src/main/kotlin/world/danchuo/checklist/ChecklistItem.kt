package world.danchuo.checklist

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * A discipline item, data-driven: a new one is a DB row, no release. Items are not binary but
 * carry a goal [target] (stretching 1, reading 2/day), progress held as one number in
 * [ChecklistEntry]. `monster` is special — its own ingest field, not an `items` counter. §5.6
 */
@Entity
@Table(name = "checklist_item")
class ChecklistItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Stable machine key (as sent by the shortcut), unique. */
    @Column(nullable = false, unique = true)
    lateinit var key: String

    @Column(nullable = false)
    lateinit var label: String

    @Column(name = "icon")
    var icon: String? = null

    /** Daily target count; 1 for binary items. */
    @Column(nullable = false)
    var target: Int = 1

    @Column(nullable = false)
    var active: Boolean = true

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
