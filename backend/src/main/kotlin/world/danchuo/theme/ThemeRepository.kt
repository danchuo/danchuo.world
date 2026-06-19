package world.danchuo.theme

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/**
 * Доступ к волнам. Публичный шов слайса:
 * - [findActive] — активная волна (default отображения); `null`, если ни одна не размечена.
 * - [listReleased] — все выпущенные (для переключателя), старые первыми по [Theme.releasedAt].
 */
@ApplicationScoped
class ThemeRepository : PanacheRepository<Theme> {

    fun findActive(): Theme? = find("active", true).firstResult()

    fun listReleased(): List<Theme> = listAll(Sort.by("releasedAt"))
}
