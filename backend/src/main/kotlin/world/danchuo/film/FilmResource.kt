package world.danchuo.film

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение фото-дропов (PRD §5.12, §12 M4; DESIGN §7.5). Всё на чтение, без токена (§3).
 *
 * - `GET /api/drops` — список дропов (тизер-тайл); до B1 — пустой массив.
 * - `GET /api/drops/{id}` — кадры дропа (модалка-галерея); неизвестный id — 404.
 *
 * До B1 (загрузка кадров) данных нет — это штатное пустое состояние, не ошибка.
 */
@Path("/api/drops")
@Produces(MediaType.APPLICATION_JSON)
class FilmResource(
    private val drops: FilmDropRepository,
    private val photos: FilmPhotoRepository,
) {

    @GET
    fun list(): List<FilmDropView> = drops.listOrdered().map { drop ->
        val coverUrl = drop.coverPhotoId?.let { photos.findById(it)?.imageUrl }
        FilmDropView(
            id = drop.id!!,
            title = drop.title,
            droppedOn = drop.droppedOn.toString(),
            monthLabel = drop.monthLabel,
            photoCount = drop.photoCount,
            coverPhotoUrl = coverUrl,
        )
    }

    @GET
    @Path("/{id}")
    fun photos(@PathParam("id") id: Long): Response {
        val drop = drops.findById(id)
            ?: return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "drop_not_found", "id" to id))
                .build()
        val frames = photos.listByDrop(drop.id!!).map(FilmPhotoView::from)
        return Response.ok(frames).build()
    }
}
