package world.danchuo.social

import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Public read projections of the social slice (PRD §5.8). `GET /api/social-links` and
 * `GET /api/artifacts` return these DTOs; the board draws the link block and the artifact marquee.
 */

/** A social link: icon, caption, hyperlink. */
data class SocialLinkView(
    val platform: String,
    val name: String,
    val url: String,
    val icon: String?,
) {
    companion object {
        fun from(s: SocialLink) = SocialLinkView(s.platform, s.name, s.url, s.icon)
    }
}

/**
 * A marquee artifact. [firstMentionedOn] is an ISO string (`YYYY-MM-DD`), shown only in the hover
 * popover (§5.8, DESIGN §7.2), never in the row itself.
 */

/** An artifact in the admin UI: every form field, including the frame-search hint (§5.12). */
@RegisterForReflection
data class AdminArtifactView(
    val id: Long,
    val name: String,
    val imageUrl: String?,
    val firstMentionedOn: String,
    val rotatable: Boolean,
    val detectionHint: String?,
    /** Address of the item's `.glb`, or `null` — then wave 03 does not show it at all. */
    val model3dUrl: String?,
)

data class ArtifactView(
    /** Needed to match an item with its highlight box on a drop frame (PRD §5.12). */
    val id: Long,
    val name: String,
    val imageUrl: String?,
    val firstMentionedOn: String,
    /** Whether the item may lie on its side in the marquee running across it (DESIGN §7.2). */
    val rotatable: Boolean,
    /**
     * The item's own `.glb`, or `null` for an item that has none. Editions built on volume show
     * only items that have one: a flat ribbon can stand in for a thing, a shaft cannot. DESIGN §7.2
     */
    val model3dUrl: String?,
) {
    companion object {
        fun from(a: Artifact) = ArtifactView(
            a.id!!,
            a.name,
            a.imageUrl,
            a.firstMentionedOn.toString(),
            a.rotatable,
            a.model3dUrl,
        )
    }
}
