package world.danchuo.summary

/**
 * What exactly was summarised. The discriminator of a [ContentSummary] row and the key to the
 * prompt vocabulary. The kind is part of the key rather than a separate table: a sitting id is
 * unique inside its slice but not across slices.
 */
enum class SummaryKind {
    /** A sitting with a book from the Anx shelf (the `reading` slice). */
    READING,

    /** A sitting with a podcast episode (the `spotify` slice). */
    PODCAST,
    ;

    fun code(): String = name.lowercase()

    companion object {
        fun of(code: String?): SummaryKind? = entries.firstOrNull { it.code() == code }
    }
}

/**
 * A sitting still owed a summary — a SNAPSHOT taken by the source in its own transaction, not an
 * entity, because the trip to the model takes seconds and must not hold one open. [from] and [to]
 * are 0..1 inside the source's own unit, and the core need not know which. PRD §5.16
 */
data class SummaryTarget(
    val kind: SummaryKind,
    /** The sitting id INSIDE its source slice; unique together with [kind], not on its own. */
    val sessionId: Long,
    /** What the stretch is captioned by: the book title (an episode uses its own title). */
    val title: String,
    /** The caption's second line: the book's author (for an episode, the show name). */
    val byline: String?,
    val from: Double,
    val to: Double,
    /**
     * The source's key to the text itself — OPAQUE to the core. For a book it is the shelf file
     * path; for an episode it will be an audio link. The core carries it from
     * [SummarySource.candidates] back into [SummarySource.excerpt] and never looks inside.
     */
    val ref: String? = null,
)

/** The stretch's text and what captions it inside the source. */
data class SummaryExcerpt(
    val text: String,
    /** Section titles falling inside the stretch; empty when the source does not know them. */
    val sections: List<String> = emptyList(),
)

/** The model's parsed reply: the points and, if it gave one, a closing line. */
data class Retelling(
    val bullets: List<String>,
    val takeaway: String?,
)

/**
 * The seam between the summary core and the slice owning an external source: THE SOURCE KNOWS
 * WHERE THE TEXT COMES FROM, THE CORE KNOWS WHO AND WHEN TO SUMMARISE. One instance, not one per
 * slice, because the model's free lane is a single scarce limit shared by all. PRD §5.16
 */
interface SummarySource {

    fun kind(): SummaryKind

    /**
     * Whether the source is configured. When it is not, [SummaryPoller] skips it silently: that is
     * a normal state (no shelf, no OAuth), not a breakage.
     */
    fun isConfigured(): Boolean

    /**
     * Sittings a passage CAN be cut from, newest first — the board is read starting from today.
     * There is no need to filter out what was already told: that belongs to the queue, and a
     * source answers only "is there anything to cut".
     */
    fun candidates(): List<SummaryTarget>

    /**
     * The stretch's text; `null` when there is nothing to cut (no file, no parse, an empty
     * window). Called OUTSIDE a transaction: it may make a file or a network trip.
     */
    fun excerpt(target: SummaryTarget): SummaryExcerpt?
}
