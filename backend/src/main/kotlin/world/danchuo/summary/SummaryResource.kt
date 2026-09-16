package world.danchuo.summary

import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public reads of summaries — one endpoint for every kind of source. A separate request rather
 * than a field in the day projection, which travels for every calendar day while this text is only
 * wanted by an opened window. An unknown kind is a 404, like a missing summary. PRD §5.16.1
 */
@Path("/api/summary")
class SummaryResource(private val summaries: SummaryService) {

    /**
     * The summary of a stretch covered in one sitting. 404 means there is none (it did not come
     * together, or is still queued). The reply shape is not invented for that case: an empty
     * summary and an absent one are the same thing to the modal.
     */
    @GET
    @Path("/{kind}/{sessionId}")
    @Produces(MediaType.APPLICATION_JSON)
    fun summary(
        @PathParam("kind") kind: String,
        @PathParam("sessionId") sessionId: Long,
    ): Response {
        val summary = SummaryKind.of(kind)
            ?.let { summaries.readyFor(it, sessionId) }
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        return Response.ok(
            SummaryView(
                bullets = summary.bulletLines(),
                takeaway = summary.takeaway?.takeIf { it.isNotBlank() },
            ),
        ).build()
    }
}

/**
 * A summary going out: bullet points and the closing line. The window needs nothing more — title,
 * caption, cover and passage bounds already came with the day card. `@RegisterForReflection` is
 * LOAD-BEARING here, as on every response of ours (docs/pitfalls.md).
 */
@RegisterForReflection
data class SummaryView(
    val bullets: List<String>,
    val takeaway: String?,
)
