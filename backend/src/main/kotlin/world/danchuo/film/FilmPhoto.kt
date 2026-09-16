package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * One frame of a photo drop. [width]/[height] are the web variant's size AFTER EXIF rotation, so
 * the client composes without guessing orientation. The bytes live in [PhotoStorage] under the key
 * `"{dropId}/{sortOrder}"`, and variant URLs derive from it, so no path is stored. PRD §5.12
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

    /** The frame is orientation-checked (by LLM or by hand) — a re-run skips it (B9). */
    @Column(name = "orientation_checked_at")
    var orientationCheckedAt: Instant? = null

    /** Orientation result: `none`/`cw90`/`ccw90`/`r180`/`ambiguous`/`manual` (B9). */
    @Column(name = "orientation_applied")
    var orientationApplied: String? = null

    /**
     * The web and thumb bytes were actually rewritten by a rotation; this version feeds the `?v=`
     * cache-bust in the URL, since `/api/film-media` is cached as immutable (B9).
     */
    @Column(name = "rotated_at")
    var rotatedAt: Instant? = null

    /**
     * The frame is artifact-checked, and a re-run skips it (as with [orientationCheckedAt]). A
     * provider failure does NOT set it: "could not check" and "checked, nothing there" are
     * different states, and merging them records an outage as an absence of artifacts.
     */
    @Column(name = "artifacts_checked_at")
    var artifactsCheckedAt: Instant? = null

    val storageKey: String get() = "$dropId/$sortOrder"
}
