package world.danchuo.reading

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import java.nio.file.Files
import kotlin.io.path.extension

/**
 * Публичное чтение слайса `reading` (PRD §5.16). Сессии сами по себе наружу не ходят — они
 * приезжают внутри проекции дня (`GET /api/days/…`, поле `books` у пункта «Чтение»); отдельного
 * эндпоинта им пока не нужно. Здесь живёт только то, что проекцией не передать: обложки.
 *
 * Пересказ прочитанного отсюда ушёл: строка у него общая на все источники, и отдаёт её общая же
 * точка `GET /api/summary/{kind}/{id}` ([world.danchuo.summary.SummaryResource]).
 *
 * Обложка отдаётся по **id сессии**, а не по пути внутри полки. Путь пришёл из чужой базы,
 * которую пишет телефон, и делать его частью публичного URL значило бы пускать её содержимое
 * в маршрутизацию; id сессии — наш собственный ключ, а разрешение пути остаётся внутри
 * [AnxShelf] (там же и проверка выхода за каталог).
 */
@Path("/api/reading")
class ReadingResource(
    private val sessions: ReadingSessionRepository,
    private val shelf: AnxShelf,
) {

    @GET
    @Path("/cover/{sessionId}")
    @Produces(MediaType.APPLICATION_OCTET_STREAM)
    fun cover(@PathParam("sessionId") sessionId: Long): Response {
        val coverPath = sessions.findById(sessionId)?.coverPath
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        val file = shelf.coverFile(coverPath)
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        val bytes = runCatching { Files.readAllBytes(file) }.getOrNull()
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        // Обложка книги при жизни сессии не меняется (сменил обложку — читалка кладёт НОВЫЙ файл
        // с новым именем, см. book_detail в исходниках Anx), так что кэшируем надолго.
        val cache = CacheControl().apply {
            maxAge = 60 * 60 * 24 * 30 // 30 дней
            isPrivate = false
        }
        return Response.ok(bytes, mediaTypeOf(file.extension)).cacheControl(cache).build()
    }

    /** Anx кладёт обложки png/jpeg; по расширению этого достаточно, магию файла не читаем. */
    private fun mediaTypeOf(extension: String): String = when (extension.lowercase()) {
        "png" -> "image/png"
        "webp" -> "image/webp"
        else -> "image/jpeg"
    }
}
