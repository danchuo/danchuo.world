package world.danchuo.checklist

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к пунктам дисциплины. Резолв ключей ingest идёт через [findByKey]. */
@ApplicationScoped
class ChecklistItemRepository : PanacheRepository<ChecklistItem> {

    fun findByKey(key: String): ChecklistItem? = find("key", key).firstResult()
}
