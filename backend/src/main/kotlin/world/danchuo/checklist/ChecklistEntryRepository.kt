package world.danchuo.checklist

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Доступ к отметкам дисциплины. [upsert] держит идемпотентность по (date, item):
 * повтор за дату правит ту же строку, прогресс зажимается в `0..target`.
 */
@ApplicationScoped
class ChecklistEntryRepository : PanacheRepository<ChecklistEntry> {

    fun listByDate(date: LocalDate): List<ChecklistEntry> = list("date", date)

    /** Отметки в диапазоне дат `[from, to]` включительно — для агрегатора календаря (M2). */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<ChecklistEntry> =
        list("date >= ?1 and date <= ?2", from, to)

    private fun findByDateAndItem(date: LocalDate, itemId: Long): ChecklistEntry? =
        find("date = ?1 and itemId = ?2", date, itemId).firstResult()

    /**
     * Записать прогресс, только если отметки за (date, item) ещё нет; `true` — записали.
     *
     * Шов для **производных** отметок (пункт «дневник» ставится минутами «осознанности»,
     * см. [JournalMarker]): существующая строка означает «за этот день уже решено», и
     * ручной ввод её перекрывает — обычный [upsert] пишет поверх всегда.
     */
    fun upsertIfAbsent(date: LocalDate, item: ChecklistItem, count: Int): Boolean {
        if (findByDateAndItem(date, item.id!!) != null) return false
        upsert(date, item, count)
        return true
    }

    /** Записать прогресс пункта за дату; [count] зажимается в `0..target`. */
    fun upsert(date: LocalDate, item: ChecklistItem, count: Int) {
        val clamped = count.coerceIn(0, item.target)
        val entry = findByDateAndItem(date, item.id!!) ?: ChecklistEntry().apply {
            this.date = date
            itemId = item.id!!
            persist(this)
        }
        entry.count = clamped
    }
}
