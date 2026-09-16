package world.danchuo.social

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate

/**
 * A marquee artifact: an item with a picture and a caption. Data-driven, so a new one is a row,
 * and the ribbon's order is CHRONICLE — [firstMentionedOn] ascending, not a separate field.
 * [model3dUrl] is backlog groundwork and stays empty for now. PRD §5.8, §7; DESIGN §7.2
 */
@Entity
@Table(name = "artifact")
class Artifact {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(nullable = false)
    lateinit var name: String

    /** Picture or GIF (PNG/GIF) — frontend static or storage; `null` means no picture. */
    @Column(name = "image_url")
    var imageUrl: String? = null

    /** Date of first mention (§5.8): shown in the popover only. */
    @Column(name = "first_mentioned_on", nullable = false)
    lateinit var firstMentionedOn: LocalDate

    /** A backlog placeholder (§9): the artifact's 3D model; M4 does not fill it. */
    @Column(name = "model_3d_url")
    var model3dUrl: String? = null

    /**
     * Whether the item may be laid on its side when the ribbon runs across its long edge. This is
     * a property of the OBJECT, not of its proportions: glasses and a soap dish have a right way
     * up, a racket does not. False by default — a new artifact shows exactly as drawn. DESIGN §7.2
     */
    @Column(name = "rotatable", nullable = false)
    var rotatable: Boolean = false

    /**
     * What the item looks like, for finding artifacts on photo-drop frames (PRD §5.12). The
     * catalogue [name] will not do: a model cannot search for a part code, it needs a description
     * like "a white and pink badminton racket". `null` falls back to [name].
     */
    @Column(name = "detection_hint")
    var detectionHint: String? = null
}
