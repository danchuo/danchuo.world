package world.danchuo.reading

import io.quarkus.runtime.annotations.RegisterForReflection
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
 * Обложка отдаётся по **id сессии**, а не по пути внутри полки. Путь пришёл из чужой базы,
 * которую пишет телефон, и делать его частью публичного URL значило бы пускать её содержимое
 * в маршрутизацию; id сессии — наш собственный ключ, а разрешение пути остаётся внутри
 * [AnxShelf] (там же и проверка выхода за каталог).
 */
@Path("/api/reading")
class ReadingResource(
    private val sessions: ReadingSessionRepository,
    private val shelf: AnxShelf,
    private val summaries: ReadingSummaryService,
) {

    /**
     * Пересказ прочитанного за заход куска (PRD §5.16). Отдельным запросом, а не в проекции дня:
     * это текст на несколько строк, который нужен только раскрытому окну, а проекция едет на
     * каждый день календаря. В карточке дня остаётся один флаг — есть ли что показывать.
     *
     * 404 — пересказа нет (не собрался либо ещё в очереди). Форма ответа при этом не выдумывается:
     * пустой пересказ и отсутствующий — для окна одно и то же.
     */
    @GET
    @Path("/summary/{sessionId}")
    @Produces(MediaType.APPLICATION_JSON)
    fun summary(@PathParam("sessionId") sessionId: Long): Response {
        val summary = summaries.readyFor(sessionId)
            ?: return Response.status(Response.Status.NOT_FOUND).build()
        return Response.ok(
            ReadingSummaryView(
                bullets = summary.bulletLines(),
                takeaway = summary.takeaway?.takeIf { it.isNotBlank() },
            ),
        ).build()
    }

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

/**
 * Пересказ куска наружу: пункты и строка-итог. Ничего больше окну не нужно — книга, автор,
 * обложка и проценты у него уже есть из карточки дня.
 *
 * ⚠️ `@RegisterForReflection` здесь **несущая**, как у всех наших ответов ([SleepNightView],
 * `DayView`, `FilmViews`). Без неё native-образ вырезает у класса геттеры как «никем не
 * вызываемые» — Jackson не находит ни одного свойства и отдаёт `{}` с кодом 200. На JVM
 * (дев, тесты, локальный стек) всё при этом работает, поэтому промах доезжает до прода целым:
 * ровно так этот эндпоинт и приехал туда пустым.
 */
@RegisterForReflection
data class ReadingSummaryView(
    val bullets: List<String>,
    val takeaway: String?,
)
