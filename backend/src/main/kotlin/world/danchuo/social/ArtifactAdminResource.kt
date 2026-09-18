package world.danchuo.social

import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.jboss.resteasy.reactive.RestForm
import org.jboss.resteasy.reactive.multipart.FileUpload

/**
 * Creating artifacts from `/admin`: list, create, edit, delete, upload an image and ask for a
 * detection hint. Under the ingest paths, so the bearer filter closes it. Before this, every new
 * item meant a Liquibase migration — that is, a code change and a deploy. PRD §5.8, §9
 */
@Path("/api/ingest/artifacts")
class ArtifactAdminResource(
    private val service: ArtifactAdminService,
) {

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun list(): List<AdminArtifactView> = service.list()

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun create(input: ArtifactInput): Response = guarded {
        Response.status(Response.Status.CREATED).entity(service.create(input)).build()
    }

    @PUT
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    fun update(@PathParam("id") id: Long, input: ArtifactInput): Response = guarded {
        service.update(id, input)?.let { Response.ok(it).build() } ?: notFound()
    }

    @DELETE
    @Path("/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    fun delete(@PathParam("id") id: Long): Response =
        if (service.delete(id)) Response.noContent().build() else notFound()

    @POST
    @Path("/{id}/image")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    fun uploadImage(@PathParam("id") id: Long, @RestForm("image") image: FileUpload?): Response {
        image ?: return badRequest("image_required")
        return service.putImage(id, image.uploadedFile())?.let { Response.ok(it).build() }
            ?: notFound()
    }

    /**
     * Binds a 3D model to the item. `.glb` only — a `.gltf` is JSON plus neighbouring files, and
     * one upload cannot carry them. Wave 03 shows in the shaft only items that have one.
     */
    @POST
    @Path("/{id}/model")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    fun uploadModel(@PathParam("id") id: Long, @RestForm("model") model: FileUpload?): Response {
        model ?: return badRequest("model_required")
        return guarded {
            service.putModel(id, model.uploadedFile())?.let { Response.ok(it).build() } ?: notFound()
        }
    }

    @DELETE
    @Path("/{id}/model")
    @Produces(MediaType.APPLICATION_JSON)
    fun deleteModel(@PathParam("id") id: Long): Response =
        service.deleteModel(id)?.let { Response.ok(it).build() } ?: notFound()

    /**
     * Describes an item from its picture with a cheap model. An empty reply (`hint: null`) is
     * normal: the model is unconfigured or stayed silent, and the field is filled by hand.
     */
    @POST
    @Path("/{id}/hint")
    @Produces(MediaType.APPLICATION_JSON)
    fun suggestHint(@PathParam("id") id: Long): Response =
        Response.ok(mapOf("hint" to service.suggestHint(id))).build()

    private inline fun guarded(block: () -> Response): Response = try {
        block()
    } catch (e: IllegalArgumentException) {
        badRequest(e.message ?: "bad_request")
    }

    private fun badRequest(error: String): Response =
        Response.status(Response.Status.BAD_REQUEST).entity(mapOf("error" to error)).build()

    private fun notFound(): Response =
        Response.status(Response.Status.NOT_FOUND).entity(mapOf("error" to "artifact_not_found"))
            .build()
}
