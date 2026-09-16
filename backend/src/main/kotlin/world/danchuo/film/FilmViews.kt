package world.danchuo.film

import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Photo-drop projections (PRD §5.12; DESIGN §7.5). The public ones feed the board, archive and
 * modal; the admin ones sit behind the bearer for /admin (B1). [PhotoStorage] builds variant URLs
 * from the key, so the projections are assembled in resources rather than a `from` factory.
 */

/** A drop for the teaser tile and archive: caption, thumb cover and frame count. */
// Response-wrapped views need explicit reflection registration for native-image (else {} in JSON).
@RegisterForReflection
data class FilmDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    /** Thumb URL of the cover frame (`null` when the drop has no frames). */
    val coverPhotoUrl: String?,
)

/** A drop frame for the modal: [imageUrl] (web), [thumbUrl] (preview) and composition sizes. */
@RegisterForReflection
data class FilmPhotoView(
    val imageUrl: String,
    val thumbUrl: String,
    val width: Int?,
    val height: Int?,
    /** Artifacts found on the frame — highlights in the modal (§5.12). Empty when there are none. */
    val artifacts: List<ArtifactBoxView> = emptyList(),
)

/**
 * A highlighted artifact: caption plus a box in FRAME FRACTIONS (0..1). Fractions, not pixels —
 * the frame renders at several sizes (mosaic, thumb, modal) and the board scales them itself.
 */
@RegisterForReflection
data class ArtifactBoxView(
    val artifactId: Long,
    val name: String,
    /**
     * The item's catalogue picture, the same one the artifact marquee uses; `null` for an item
     * without one. The box tooltip needs it: a name does not explain what the print on the photo
     * is, while the familiar cut-out item explains it instantly (DESIGN §7.5).
     */
    val imageUrl: String?,
    /**
     * Whether the item may lie on its side. The tooltip card holds a LANDSCAPE slot while an item
     * may be drawn upright (a racket), and without the flag it would collapse to a thread. Same
     * flag as the marquee (DESIGN §7.2): it permits, the picture's ratio decides, on the frontend.
     */
    val rotatable: Boolean,
    val x0: Double,
    val y0: Double,
    val x1: Double,
    val y1: Double,
)

// -- Admin projections (behind the bearer, /api/ingest/drops) --

/** A drop in the admin UI: everything needed to manage it, including the current cover. */
@RegisterForReflection
data class AdminDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    val coverPhotoId: Long?,
)

/** A frame in the admin cover grid: id, thumb and whether it is the current cover. */
@RegisterForReflection
data class AdminPhotoView(
    val id: Long,
    val thumbUrl: String,
    /**
     * The web variant, for marking artifacts by hand (§5.12): the box is dragged across the frame
     * and its coordinates are fractions of the drawn size. On a 96px preview a one-pixel miss is a
     * whole percent of the frame, so the marker opens the big frame rather than the grid.
     */
    val imageUrl: String,
    // Runtime Jackson has no Kotlin module (test-only dep) and strips the "is" prefix from
    // boolean getters — pin the wire name to what the frontend type expects.
    @get:JsonProperty("isCover")
    val isCover: Boolean,
    /** Orientation result (B9): `none`/`cw90`/`ccw90`/`r180`/`ambiguous`/`manual`, `null` unchecked. */
    val orientation: String?,
    /** What was found on the frame (§5.12) — admin lists it and lets the owner remove extras. */
    val artifacts: List<ArtifactBoxView> = emptyList(),
)

/** A drop's orientation-check status (B9), polled by admin while `state == "running"`. */
@RegisterForReflection
data class OrientationStatusView(
    /** `idle` (never started) / `running` / `done` / `failed`. */
    val state: String,
    /** How many frames were unchecked when the pass started (or all frames when `idle`). */
    val total: Int,
    val checked: Int,
    val rotated: Int,
    /** Skipped (the LLM was silent, or bytes were broken) — unchecked until the next pass. */
    val skipped: Int,
)

/** A drop's artifact-search status (§5.12), polled by admin while `state == "running"`. */
@RegisterForReflection
data class ArtifactScanStatusView(
    /** `idle` (never started) / `queued` / `running` / `done` / `failed` / `cancelled`. */
    val state: String,
    /** How many frames were due for checking when the pass started (or all frames when `idle`). */
    val total: Int,
    val checked: Int,
    /** How many boxes the model found in the pass (when `idle`, how many sit in the DB). */
    val found: Int,
    /** Skipped (the model was silent, or no bytes) — unchecked until the next pass. */
    val skipped: Int,
)

/**
 * Summary of a run launched across every drop at once. It is separate from
 * [ArtifactScanStatusView] because the question differs: that one answers "what about this drop",
 * this one "how much longer, and is it time to stop". Without it an archive run was opaque. §5.12
 */
@RegisterForReflection
data class ArtifactScanRunView(
    /** `idle` (no pass yet) / `running` / `done` / `failed` / `cancelled`. */
    val state: String,
    /** Frames due for checking across the whole pass. */
    val total: Int,
    val checked: Int,
    val found: Int,
    /**
     * Frames skipped. A persistently large number with zero findings almost never means "nothing
     * on the frames" — it means a silent provider: no key, wrong provider, or a rate limit.
     */
    val skipped: Int,
    /** Drops in the pass and how many are done, so a long pass visibly moves. */
    val drops: Int,
    val dropsDone: Int,
    /** Item name when the pass was started for one artifact; `null` for the whole catalogue. */
    val artifactName: String?,
)

/** Zip upload result: the created drop plus frames processed and skipped (HEIC, corrupt). */
@RegisterForReflection
data class UploadResultView(
    val drop: AdminDropView,
    val processed: Int,
    val skipped: Int,
)
