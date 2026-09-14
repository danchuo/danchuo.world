package world.danchuo.instagram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.Response

/**
 * Раздача снятых картинок Instagram (PRD §5.17) — кадра поста и аватара. Публично, как медиа
 * дропов и артефактов.
 *
 * Кэш короткий: под теми же двумя адресами завтра лежит уже следующий пост, и висящая неделю
 * копия в браузере показывала бы позавчерашний кадр с сегодняшней подписью.
 */
@Path("/api/instagram-media")
class InstagramMediaResource(private val storage: InstagramImageStorage) {

    @GET
    @Path("/{kind}")
    fun image(@PathParam("kind") kind: String): Response {
        val parsed = runCatching { InstagramImageStorage.Kind.valueOf(kind.uppercase()) }.getOrNull()
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val bytes = storage.get(parsed)
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val cache = CacheControl().apply { maxAge = 3600 }
        // Тип вычисляем по байтам: Instagram отдаёт и JPEG, и (у аватаров) WebP.
        return Response.ok(bytes, sniff(bytes)).cacheControl(cache).build()
    }

    /**
     * Сигнатура формата по первым байтам. Хранилище кладёт то, что приехало, не перекодируя:
     * перекодировать кадр ради известного расширения — терять качество на ровном месте.
     */
    private fun sniff(bytes: ByteArray): String = when {
        bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() -> "image/jpeg"
        bytes.size >= 8 && bytes[1] == 'P'.code.toByte() && bytes[2] == 'N'.code.toByte() -> "image/png"
        bytes.size >= 12 && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP" -> "image/webp"
        else -> "application/octet-stream"
    }
}
