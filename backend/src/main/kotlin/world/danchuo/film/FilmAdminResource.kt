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
import org.eclipse.microprofile.config.inject.ConfigProperty
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
 * - `DELETE /api/ingest/drops/{id}/photos/{photoId}` — удалить один кадр (неудачный).
 * - `POST /api/ingest/drops/{id}/orientation` — запустить LLM-проверку поворота кадров (B9).
 * - `GET /api/ingest/drops/{id}/orientation` — статус проверки (поллинг из админки).
 * - `POST /api/ingest/drops/{id}/photos/{photoId}/rotate` — ручной поворот кадра (override).
 */
@Path("/api/ingest/drops")
class FilmAdminResource(
    private val film: FilmService,
    private val orientation: FilmOrientationService,
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
        // B9: свежезалитый дроп сразу уходит на фоновую проверку поворота (аплоад не ждёт).
        if (autoCheck) orientation.start(result.drop.id)
        return Response.status(Response.Status.CREATED).entity(result).build()
    }

    // ── Проверка поворота (B9) ──

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

    /** Ручной поворот кадра; в ответ — обновлённый список кадров (свежие thumb-URL с `?v=`). */
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

    /** Удалить один кадр дропа (override владельца — неудачный кадр). Ответ — свежий список кадров. */
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

/** Тело `PUT /cover`: id кадра, который станет обложкой. */
data class CoverRequest(val photoId: Long = 0)

/** Тело `POST /rotate` (B9): код поворота — `cw90` / `ccw90` / `r180`. */
data class RotateRequest(val rotation: String? = null)
