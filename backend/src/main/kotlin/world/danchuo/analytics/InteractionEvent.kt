package world.danchuo.analytics

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * A raw click event for the heatmap, sibling of [AnalyticsEvent] and under the same private
 * contour. The model is PER TILE, not per pixel, and the offsets are fractions inside the tile;
 * a click outside every tile leaves [tileId] null. PRD §5.11
 */
@Entity
@Table(name = "interaction_event")
class InteractionEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "occurred_at", nullable = false)
    lateinit var occurredAt: Instant

    /** The page the click happened on (usually `/`). */
    @Column(nullable = false)
    lateinit var path: String

    /** Machine id of the board tile (`today`, `music`, ...); `null` means a click off the tiles. */
    @Column(name = "tile_id")
    var tileId: String? = null

    /** X fraction inside the tile bounding box, 0..1; `null` means a click off the tiles. */
    @Column(name = "offset_x_pct")
    var offsetXPct: Double? = null

    /** Y fraction inside the tile bounding box, 0..1; `null` means a click off the tiles. */
    @Column(name = "offset_y_pct")
    var offsetYPct: Double? = null

    /** Viewport width at click time (px), for a future breakpoint slice. */
    @Column(name = "viewport_w")
    var viewportW: Int? = null

    @Column(name = "visitor_day_hash", nullable = false)
    lateinit var visitorDayHash: String

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false

    /** Internal correlation with the beacon visit (client-side UUID); may be `null`. */
    @Column(name = "visit_id")
    var visitId: String? = null
}
