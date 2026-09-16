package world.danchuo.checklist

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class ChecklistItemRepository : PanacheRepository<ChecklistItem> {

    fun findByKey(key: String): ChecklistItem? = find("key", key).firstResult()

    /** Active items in display order — the discipline skeleton for the aggregator. */
    fun listActive(): List<ChecklistItem> =
        find("active = ?1 order by sortOrder", true).list()
}
