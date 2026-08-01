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
 * Заведение артефактов через `/admin` (PRD §5.8, §9 п.8). Под `/api/ingest` ⇒ закрыто bearer'ом.
 *
 * До этого каждый новый предмет означал миграцию Liquibase — то есть правку кода и раскатку;
 * теперь это форма.
 *
 * - `GET    /api/ingest/artifacts` — список для управления.
 * - `POST   /api/ingest/artifacts` — завести предмет.
 * - `PUT    /api/ingest/artifacts/{id}` — изменить поля.
 * - `DELETE /api/ingest/artifacts/{id}` — удалить (вместе с картинкой).
 * - `POST   /api/ingest/artifacts/{id}/image` (multipart) — загрузить картинку.
 * - `POST   /api/ingest/artifacts/{id}/hint` — предложить описание для поиска по картинке.
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
     * Описание предмета по его картинке — дешёвой моделью. Пустой ответ (`hint: null`) штатен:
     * модель не настроена или промолчала, поле дозаполняется руками.
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
