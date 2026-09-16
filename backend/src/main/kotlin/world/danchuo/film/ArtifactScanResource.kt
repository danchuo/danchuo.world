package world.danchuo.film

import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Archive-wide artifact scan — the "a new item was added, find it in old frames" path. A separate
 * path rather than under the drop id, which it would clash with. Manual only, with a status `GET`
 * and a stop `DELETE` beside it: a long paid run needs a brake. PRD §5.12
 */
@Path("/api/ingest/artifact-scan")
class ArtifactScanResource(
    private val artifactScan: ArtifactDetectionService,
) {

    /** [artifactId] searches for this item only, leaving the other items' findings alone. */
    @POST
    @Produces(MediaType.APPLICATION_JSON)
    fun scanEverything(@QueryParam("artifactId") artifactId: Long?): Response = try {
        Response.status(Response.Status.ACCEPTED).entity(artifactScan.startAll(artifactId)).build()
    } catch (e: IllegalArgumentException) {
        Response.status(Response.Status.NOT_FOUND).entity(mapOf("error" to e.message)).build()
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun status(): ArtifactScanRunView = artifactScan.runStatus()

    @DELETE
    @Produces(MediaType.APPLICATION_JSON)
    fun cancel(): Response =
        if (artifactScan.cancel()) {
            Response.ok(artifactScan.runStatus()).build()
        } else {
            Response.status(Response.Status.CONFLICT)
                .entity(mapOf("error" to "no_running_scan"))
                .build()
        }
}
