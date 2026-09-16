package world.danchuo.projects

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Public project reads (PRD §5.7). `GET /api/projects` lists them newest first; no records means
 * an empty array rather than an error, and the board draws a quiet empty state. All reads are
 * token-free (§3): `IngestAuthFilter` guards only `api/ingest`.
 */
@Path("/api/projects")
@Produces(MediaType.APPLICATION_JSON)
class ProjectsResource(
    private val repository: ProjectRepository,
) {

    @GET
    fun list(): List<ProjectView> = repository.listOrdered().map(ProjectView::from)
}
