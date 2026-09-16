package world.danchuo.theme

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/**
 * Access to waves, the slice's public seam: [findActive] gives the display default or `null` when
 * none is marked, and [listReleased] gives every released wave for the switcher, oldest first.
 */
@ApplicationScoped
class ThemeRepository : PanacheRepository<Theme> {

    fun findActive(): Theme? = find("active", true).firstResult()

    fun listReleased(): List<Theme> = listAll(Sort.by("releasedAt"))
}
