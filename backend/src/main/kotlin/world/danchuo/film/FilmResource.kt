package world.danchuo.film

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение фото-дропов (PRD §5.12, DESIGN §7.5). Всё на чтение, без токена (§3).
 *
 * - `GET /api/drops` — список дропов (тайл показывает только последний, страница /drops — все).
 * - `GET /api/drops/{id}` — кадры дропа (модалка-галерея); неизвестный id — 404.
 *
 * До первой загрузки через /admin (B1) данных нет — штатное пустое состояние, не ошибка.
 */
@Path("/api/drops")
@Produces(MediaType.APPLICATION_JSON)
class FilmResource(
    private val film: FilmService,
) {

    @GET
    fun list(): List<FilmDropView> = film.publicList()

    @GET
    @Path("/{id}")
    fun photos(@PathParam("id") id: Long): Response {
        val frames = film.publicPhotos(id)
            ?: return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "drop_not_found", "id" to id))
                .build()
        return Response.ok(frames).build()
    }
}
