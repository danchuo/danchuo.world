package world.danchuo.feedback

import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * The owner's inbox. It lives under `api/ingest`, so `IngestAuthFilter` demands the bearer
 * automatically — notes are private, and nothing a visitor writes is ever served back to the
 * public board. There is no update: a note is somebody's words, to read or to delete. PRD §5.19
 */
@Path("/api/ingest/feedback")
@Produces(MediaType.APPLICATION_JSON)
class FeedbackAdminResource(
    private val service: FeedbackService,
) {

    @GET
    fun list(): List<FeedbackNoteView> = service.list()

    @DELETE
    @Path("/{id}")
    fun delete(@PathParam("id") id: Long): Response =
        if (service.delete(id)) Response.noContent().build()
        else Response.status(Response.Status.NOT_FOUND)
            .entity("""{"error":"not_found"}""")
            .build()
}
