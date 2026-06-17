package world.danchuo.monster

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

/**
 * Доступ к вкусам монстра. Публичный шов слайса: соседи (`checklist` при разборе
 * `monsterFlavorKey` в `ingest/daily`) резолвят вкус по [findByKey], не лезя в БД сами.
 */
@ApplicationScoped
class MonsterFlavorRepository : PanacheRepository<MonsterFlavor> {

    /** Вкус по стабильному ключу (из шортката) либо `null`, если ключ неизвестен. */
    fun findByKey(key: String): MonsterFlavor? =
        find("key", key).firstResult()
}
