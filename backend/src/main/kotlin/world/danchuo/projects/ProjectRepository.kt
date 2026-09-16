package world.danchuo.projects

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

/**
 * Access to [Project]. The slice's public seam: ongoing projects first, finished ones below
 * (PRD §5.7); within a group, newest by start, ties broken by [Project.sortOrder].
 */
@ApplicationScoped
class ProjectRepository : PanacheRepository<Project> {

    companion object {
        /** Ongoing (open-ended) first, then newest by range start, ties by sortOrder. */
        val ORDERING: Comparator<Project> =
            compareBy<Project> { it.endYear != null }
                .thenByDescending { it.startYear }
                .thenByDescending { it.startQuarter ?: 0 }
                .thenBy { it.sortOrder }
    }

    // Projects are a handful of rows: in-memory sort keeps the grouping rule readable
    // (SQL would need a CASE over the nullable end edge).
    fun listOrdered(): List<Project> = listAll().sortedWith(ORDERING)
}
