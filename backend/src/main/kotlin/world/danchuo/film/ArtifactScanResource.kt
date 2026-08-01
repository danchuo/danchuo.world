package world.danchuo.film

import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Прогон поиска артефактов **по всему архиву** — путь «завели новый предмет, ищем его в старых
 * кадрах» (PRD §5.12). Живёт отдельным путём, а не под `/drops/{id}`, чтобы не спорить с
 * шаблоном идентификатора дропа.
 *
 * За bearer, как всё под `/api/ingest`. Запускается только руками: это обращение к платной модели
 * на каждый кадр всех дропов, поэтому ни автозапуска, ни расписания тут нет и не будет.
 */
@Path("/api/ingest/artifact-scan")
class ArtifactScanResource(
    private val artifactScan: ArtifactDetectionService,
) {

    @POST
    @Produces(MediaType.APPLICATION_JSON)
    fun scanEverything(): Response =
        Response.status(Response.Status.ACCEPTED).entity(artifactScan.startAll()).build()
}
