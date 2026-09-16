package world.danchuo.film

import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.resteasy.reactive.RestForm
import org.jboss.resteasy.reactive.multipart.FileUpload
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Drop management from /admin: upload, cover, delete, orientation check, manual rotation and
 * artifact boxes. It lives under the ingest paths, so [IngestAuthFilter] closes it behind the
 * bearer. The upload channel is a zip — iOS shortcuts cannot post ~36 files. PRD §5.12, §9
 */
@Path("/api/ingest/drops")
class FilmAdminResource(
    private val film: FilmService,
    private val orientation: FilmOrientationService,
    private val artifactScan: ArtifactDetectionService,
    @param:ConfigProperty(name = "danchuo.film.orientation.auto-check") private val autoCheck: Boolean,
) {

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    fun upload(
        @RestForm("zip") zip: FileUpload?,
        @RestForm("title") title: String?,
        @RestForm("date") date: String?,
    ): Response {
        if (zip == null) return badRequest("missing_zip")
        val cleanTitle = title?.trim().orEmpty()
        if (cleanTitle.isEmpty()) return badRequest("missing_title")
        val droppedOn = try {
            LocalDate.parse(date?.trim())
        } catch (_: DateTimeParseException) {
            return badRequest("invalid_date")
        } catch (_: NullPointerException) {
            return badRequest("missing_date")
        }

        val result = film.upload(zip.uploadedFile(), cleanTitle, droppedOn)
        // B9: a freshly uploaded drop goes straight to the background orientation check.
        if (autoCheck) orientation.start(result.drop.id)
        return Response.status(Response.Status.CREATED).entity(result).build()
    }

    // -- Orientation check (B9) --

    @POST
    @Path("/{id}/orientation")
    @Produces(MediaType.APPLICATION_JSON)
    fun startOrientation(@PathParam("id") id: Long): Response {
        val status = orientation.start(id) ?: return notFound(id)
        return Response.status(Response.Status.ACCEPTED).entity(status).build()
    }

    @GET
    @Path("/{id}/orientation")
    @Produces(MediaType.APPLICATION_JSON)
    fun orientationStatus(@PathParam("id") id: Long): Response {
        val status = orientation.status(id) ?: return notFound(id)
        return Response.ok(status).build()
    }

    /** Manual frame rotation; replies with the updated frame list (fresh thumb URLs with `?v=`). */
    @POST
    @Path("/{id}/photos/{photoId}/rotate")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun rotatePhoto(
        @PathParam("id") id: Long,
        @PathParam("photoId") photoId: Long,
        body: RotateRequest,
    ): Response {
        val rotation = FrameRotation.fromCode(body.rotation)
            ?: return badRequest("invalid_rotation")
        return try {
            if (!orientation.rotateManually(id, photoId, rotation)) return notFound(id)
            Response.ok(film.adminPhotos(id)).build()
        } catch (e: IllegalStateException) {
            Response.status(Response.Status.CONFLICT).entity(mapOf("error" to (e.message ?: "conflict"))).build()
        } catch (e: IllegalArgumentException) {
            badRequest(e.message ?: "bad_request")
        }
    }

    // -- Artifact search on frames (§5.12) --

    /**
     * Starts the search over a drop. `?recheck=true` also revisits checked frames, after artifact
     * descriptions changed. The pass is manual only: every frame is a paid model call.
     */
    @POST
    @Path("/{id}/artifacts")
    @Produces(MediaType.APPLICATION_JSON)
    fun startArtifactScan(
        @PathParam("id") id: Long,
        @QueryParam("recheck") recheck: Boolean = false,
    ): Response {
        val status = artifactScan.start(id, recheck) ?: return notFound(id)
        return Response.status(Response.Status.ACCEPTED).entity(status).build()
    }

    @GET
    @Path("/{id}/artifacts")
    @Produces(MediaType.APPLICATION_JSON)
    fun artifactScanStatus(@PathParam("id") id: Long): Response {
        val status = artifactScan.status(id) ?: return notFound(id)
        return Response.ok(status).build()
    }

    /** Places or moves a box by hand — it then outranks the model's finding. */
    @PUT
    @Path("/{id}/photos/{photoId}/artifacts/{artifactId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun saveArtifactBox(
        @PathParam("id") id: Long,
        @PathParam("photoId") photoId: Long,
        @PathParam("artifactId") artifactId: Long,
        body: BoxInput,
    ): Response = guarded {
        if (!artifactScan.saveManual(id, photoId, artifactId, body)) notFound(id)
        else Response.ok(film.adminPhotos(id)).build()
    }

    @DELETE
    @Path("/{id}/photos/{photoId}/artifacts/{artifactId}")
    @Produces(MediaType.APPLICATION_JSON)
    fun deleteArtifactBox(
        @PathParam("id") id: Long,
        @PathParam("photoId") photoId: Long,
        @PathParam("artifactId") artifactId: Long,
    ): Response = guarded {
        if (!artifactScan.deleteDetection(id, photoId, artifactId)) notFound(id)
        else Response.ok(film.adminPhotos(id)).build()
    }

    private inline fun guarded(block: () -> Response): Response = try {
        block()
    } catch (e: IllegalStateException) {
        Response.status(Response.Status.CONFLICT)
            .entity(mapOf("error" to (e.message ?: "conflict"))).build()
    } catch (e: IllegalArgumentException) {
        badRequest(e.message ?: "bad_request")
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun list(): List<AdminDropView> = film.listAdmin()

    @GET
    @Path("/{id}/photos")
    @Produces(MediaType.APPLICATION_JSON)
    fun photos(@PathParam("id") id: Long): Response {
        val photos = film.adminPhotos(id) ?: return notFound(id)
        return Response.ok(photos).build()
    }

    @PUT
    @Path("/{id}/cover")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun setCover(@PathParam("id") id: Long, body: CoverRequest): Response {
        return try {
            val view = film.setCover(id, body.photoId) ?: return notFound(id)
            Response.ok(view).build()
        } catch (e: IllegalArgumentException) {
            badRequest(e.message ?: "bad_request")
        }
    }

    /** Deletes one frame of a drop (owner override for a bad shot). Replies with the frame list. */
    @DELETE
    @Path("/{id}/photos/{photoId}")
    @Produces(MediaType.APPLICATION_JSON)
    fun deletePhoto(@PathParam("id") id: Long, @PathParam("photoId") photoId: Long): Response {
        if (orientation.isRunning(id)) {
            return Response.status(Response.Status.CONFLICT).entity(mapOf("error" to "orientation_running")).build()
        }
        return try {
            val photos = film.deletePhoto(id, photoId) ?: return notFound(id)
            Response.ok(photos).build()
        } catch (e: IllegalArgumentException) {
            badRequest(e.message ?: "bad_request")
        }
    }

    @DELETE
    @Path("/{id}")
    fun delete(@PathParam("id") id: Long): Response =
        if (film.delete(id)) Response.noContent().build() else notFound(id)

    private fun badRequest(error: String): Response =
        Response.status(Response.Status.BAD_REQUEST).entity(mapOf("error" to error)).build()

    private fun notFound(id: Long): Response =
        Response.status(Response.Status.NOT_FOUND).entity(mapOf("error" to "drop_not_found", "id" to id)).build()
}

/** Body of `PUT /cover`: the id of the frame that becomes the cover. */
data class CoverRequest(val photoId: Long = 0)

/** Body of `POST /rotate` (B9): the rotation code `cw90` / `ccw90` / `r180`. */
data class RotateRequest(val rotation: String? = null)
