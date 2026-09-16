package world.danchuo.social

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Public reads of social links and marquee artifacts, token-free like every read (§3). No rows
 * gives an empty array rather than an error — the frontend draws a quiet empty state. PRD §5.8
 */
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
class SocialResource(
    private val links: SocialLinkRepository,
    private val artifacts: ArtifactRepository,
) {

    @GET
    @Path("/social-links")
    fun socialLinks(): List<SocialLinkView> = links.listOrdered().map(SocialLinkView::from)

    @GET
    @Path("/artifacts")
    fun artifacts(): List<ArtifactView> = artifacts.listOrdered().map(ArtifactView::from)
}
