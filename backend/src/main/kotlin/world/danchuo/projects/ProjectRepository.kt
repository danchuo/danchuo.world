package world.danchuo.projects

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/**
 * Доступ к [Project]. Публичный шов слайса: новые сверху (PRD §5.7 — сортируемы по дате
 * начала промежутка), при равенстве — по [Project.sortOrder].
 */
@ApplicationScoped
class ProjectRepository : PanacheRepository<Project> {

    fun listOrdered(): List<Project> =
        listAll(
            Sort.by("startYear", Sort.Direction.Descending)
                .and("startQuarter", Sort.Direction.Descending)
                .and("sortOrder", Sort.Direction.Ascending),
        )
}
