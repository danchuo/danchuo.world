package world.danchuo.film

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.Response

/**
 * Публичная раздача кадров фото-дропа (B1, PRD §5.12) с локального диска — `/api/film-media/
 * {dropId}/{seq}/{variant}`. URL-ы генерит [LocalDiskPhotoStorage.url]; при переезде на S3/R2
 * раздача уходит на CDN, и этот ресурс становится не нужен (URL-ы станут абсолютными). Чтение
 * публично (§3), без токена; кадры неизменяемы ⇒ агрессивный кэш. Неизвестный ключ — 404.
 */
@Path("/api/film-media")
class FilmMediaResource(
    private val storage: PhotoStorage,
) {

    @GET
    @Path("/{dropId}/{seq}/{variant}")
    fun media(
        @PathParam("dropId") dropId: Long,
        @PathParam("seq") seq: Int,
        @PathParam("variant") variant: String,
    ): Response {
        val v = PhotoVariant.entries.firstOrNull { it.name.equals(variant, ignoreCase = true) }
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val bytes = storage.get("$dropId/$seq", v)
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        // Кадр по ключу неизменяем (новая загрузка = новый дроп/seq) — кэшируем надолго.
        val cache = CacheControl().apply {
            maxAge = 60 * 60 * 24 * 30 // 30 дней
            isPrivate = false
        }
        return Response.ok(bytes, "image/jpeg").cacheControl(cache).build()
    }
}
