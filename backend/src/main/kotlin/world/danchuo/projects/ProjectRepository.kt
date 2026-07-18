package world.danchuo.projects

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

/**
 * Доступ к [Project]. Публичный шов слайса: идущие «по настоящее» — сверху, завершённые —
 * ниже (PRD §5.7); внутри групп — новые по началу промежутка, при равенстве — по
 * [Project.sortOrder].
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
