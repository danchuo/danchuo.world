package world.danchuo.summary

import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение пересказов (PRD §5.16.1) — одна точка на все виды источников.
 *
 * Отдельным запросом, а не в проекции дня: это текст на несколько строк, который нужен только
 * раскрытому окну, а проекция едет на каждый день календаря. В карточке дня остаётся один флаг —
 * есть ли что показывать.
 *
 * Вид стоит в пути, а не в слайсе-владельце (`/api/reading/summary/…`, `/api/spotify/…`), потому
 * что отвечает здесь не источник, а общая очередь: строка одна и та же, различается только
 * ключ. Неизвестный вид — 404, как и отсутствующий пересказ: и то и другое значит «показывать
 * нечего», а разбирать это на странице нечем.
 */
@Path("/api/summary")
class SummaryResource(private val summaries: SummaryService) {

    /**
     * Пересказ пройденного за заход куска. 404 — пересказа нет (не собрался либо ещё в очереди).
     * Форма ответа при этом не выдумывается: пустой пересказ и отсутствующий — для окна одно и
     * то же.
     */
    @GET
    @Path("/{kind}/{sessionId}")
    @Produces(MediaType.APPLICATION_JSON)
    fun summary(
        @PathParam("kind") kind: String,
        @PathParam("sessionId") sessionId: Long,
    ): Response {
        val summary = SummaryKind.of(kind)
            ?.let { summaries.readyFor(it, sessionId) }
            ?: return Response.status(Response.Status.NOT_FOUND).build()

        return Response.ok(
            SummaryView(
                bullets = summary.bulletLines(),
                takeaway = summary.takeaway?.takeIf { it.isNotBlank() },
            ),
        ).build()
    }
}

/**
 * Пересказ куска наружу: пункты и строка-итог. Ничего больше окну не нужно — название, подпись,
 * обложка и границы куска у него уже есть из карточки дня.
 *
 * ⚠️ `@RegisterForReflection` здесь **несущая**, как у всех наших ответов ([SleepNightView],
 * `DayView`, `FilmViews`). Без неё native-образ вырезает у класса геттеры как «никем не
 * вызываемые» — Jackson не находит ни одного свойства и отдаёт `{}` с кодом 200. На JVM
 * (дев, тесты, локальный стек) всё при этом работает, поэтому промах доезжает до прода целым:
 * ровно так предшественник этого эндпоинта туда и приехал пустым.
 */
@RegisterForReflection
data class SummaryView(
    val bullets: List<String>,
    val takeaway: String?,
)
