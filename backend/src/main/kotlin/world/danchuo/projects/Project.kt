package world.danchuo.projects

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * A project bound to a time span, data-driven: a new one is a row, not a release. The range is
 * stored as numbers (start and end year plus quarter) and the readable form is assembled by the
 * frontend; a `null` end means "to date". [url] is optional — no dead links. PRD §5.7, §7
 */
@Entity
@Table(name = "project")
class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "icon_url")
    var iconUrl: String? = null

    /**
     * The project's 3D planet (`.glb`/`.gltf`). It lives BESIDE [iconUrl] rather than replacing
     * it, because the flat sprite stays forever — not every wave may wear volume, and which one
     * is worn is decided by the wave's layout, not this row. `null` = no 3D version. DESIGN §12.5
     */
    @Column(name = "model_url")
    var modelUrl: String? = null

    @Column(nullable = false)
    lateinit var title: String

    @Column
    var description: String? = null

    @Column(name = "start_year", nullable = false)
    var startYear: Int = 0

    /** Starting quarter (1-4); `null` when only the year is known. */
    @Column(name = "start_quarter")
    var startQuarter: Int? = null

    /** End year; `null` (with [endQuarter] null) means "to the present". */
    @Column(name = "end_year")
    var endYear: Int? = null

    @Column(name = "end_quarter")
    var endQuarter: Int? = null

    /** The link the block SHOWS as text (the repository or site path). */
    @Column
    var url: String? = null

    /**
     * The project's "home" — where the item itself (name and picture) leads, when that is NOT the
     * place whose path is shown as text: proxemics keeps its code in a repository while the
     * project lives as a Telegram bot. `null` means the item leads where the path does.
     */
    @Column(name = "home_url")
    var homeUrl: String? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
