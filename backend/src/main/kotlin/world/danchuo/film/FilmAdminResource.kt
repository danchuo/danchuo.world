package world.danchuo.film

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
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Управление фото-дропами через /admin (B1, PRD §5.12, §9 п.8). Живёт под `/api/ingest/…` ⇒
 * закрыто bearer-токеном сквозным [IngestAuthFilter] (правится только владельцем). Канал на
 * ~36 кадров за раз — zip (iOS-шорткатом столько файлов не залить, см. §9 п.7).
 *
 * - `POST /api/ingest/drops` (multipart) — загрузить дроп: zip + title + date.
 * - `GET /api/ingest/drops` — список дропов для управления.
 * - `GET /api/ingest/drops/{id}/photos` — кадры с id + thumb для выбора обложки.
 * - `PUT /api/ingest/drops/{id}/cover` — пометить кадр обложкой.
 * - `DELETE /api/ingest/drops/{id}` — удалить дроп (кадры + файлы).
 */
@Path("/api/ingest/drops")
class FilmAdminResource(
    private val film: FilmService,
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
        return Response.status(Response.Status.CREATED).entity(result).build()
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

    @DELETE
    @Path("/{id}")
    fun delete(@PathParam("id") id: Long): Response =
        if (film.delete(id)) Response.noContent().build() else notFound(id)

    private fun badRequest(error: String): Response =
        Response.status(Response.Status.BAD_REQUEST).entity(mapOf("error" to error)).build()

    private fun notFound(id: Long): Response =
        Response.status(Response.Status.NOT_FOUND).entity(mapOf("error" to "drop_not_found", "id" to id)).build()
}

/** Тело `PUT /cover`: id кадра, который станет обложкой. */
data class CoverRequest(val photoId: Long = 0)
