package world.danchuo.film

import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Прогон поиска артефактов **по всему архиву** — путь «завели новый предмет, ищем его в старых
 * кадрах» (PRD §5.12). Живёт отдельным путём, а не под `/drops/{id}`, чтобы не спорить с
 * шаблоном идентификатора дропа.
 *
 * За bearer, как всё под `/api/ingest`. Запускается только руками: это обращение к платной модели
 * на каждый кадр всех дропов, поэтому ни автозапуска, ни расписания тут нет и не будет. По той же
 * причине рядом есть чем его посмотреть (`GET`) и остановить (`DELETE`) — длинный прогон без
 * видимого статуса и стоп-крана владелец остановить мог только рестартом бэкенда.
 */
@Path("/api/ingest/artifact-scan")
class ArtifactScanResource(
    private val artifactScan: ArtifactDetectionService,
) {

    /** [artifactId] — искать только этот предмет, не трогая находки остальных. */
    @POST
    @Produces(MediaType.APPLICATION_JSON)
    fun scanEverything(@QueryParam("artifactId") artifactId: Long?): Response = try {
        Response.status(Response.Status.ACCEPTED).entity(artifactScan.startAll(artifactId)).build()
    } catch (e: IllegalArgumentException) {
        Response.status(Response.Status.NOT_FOUND).entity(mapOf("error" to e.message)).build()
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun status(): ArtifactScanRunView = artifactScan.runStatus()

    @DELETE
    @Produces(MediaType.APPLICATION_JSON)
    fun cancel(): Response =
        if (artifactScan.cancel()) {
            Response.ok(artifactScan.runStatus()).build()
        } else {
            Response.status(Response.Status.CONFLICT)
                .entity(mapOf("error" to "no_running_scan"))
                .build()
        }
}
