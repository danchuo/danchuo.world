package world.danchuo.projects

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Публичное чтение проектов (PRD §5.7, §12 M4). `GET /api/projects` — список, новые сверху;
 * пусто (нет записей) ⇒ пустой массив, не ошибка (фронт рисует тихое empty).
 *
 * Всё на чтение и без токена (§3): фильтр `IngestAuthFilter` стережёт только `api/ingest`.
 */
@Path("/api/projects")
@Produces(MediaType.APPLICATION_JSON)
class ProjectsResource(
    private val repository: ProjectRepository,
) {

    @GET
    fun list(): List<ProjectView> = repository.listOrdered().map(ProjectView::from)
}
