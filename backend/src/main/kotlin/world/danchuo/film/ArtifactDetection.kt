package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * An artifact found on a frame: a link to the item plus the box that highlights it. Coordinates
 * are FRACTIONS of the frame (0..1), never pixels — the mosaic scales frames freely and web and
 * thumb differ in size. [artifactId] is a flat FK to `artifact` in the `social` slice. PRD §5.12
 */
@Entity
@Table(name = "artifact_detection")
class ArtifactDetection {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "photo_id", nullable = false)
    var photoId: Long = 0

    @Column(name = "artifact_id", nullable = false)
    var artifactId: Long = 0

    @Column(name = "x0", nullable = false)
    var x0: Double = 0.0

    @Column(name = "y0", nullable = false)
    var y0: Double = 0.0

    @Column(name = "x1", nullable = false)
    var x1: Double = 0.0

    @Column(name = "y1", nullable = false)
    var y1: Double = 0.0

    /**
     * `llm` found by the model, `manual` placed by hand, `rejected` taken off by the owner.
     * A rejection is STORED, never deleted: a deleted pair would be found again by the next run
     * and the box would come back. The reasoning and the way back to `manual`: PRD §5.12.
     */
    @Column(name = "source", nullable = false)
    lateinit var source: String

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()

    companion object {
        const val SOURCE_LLM = "llm"
        const val SOURCE_MANUAL = "manual"
        const val SOURCE_REJECTED = "rejected"
    }
}
