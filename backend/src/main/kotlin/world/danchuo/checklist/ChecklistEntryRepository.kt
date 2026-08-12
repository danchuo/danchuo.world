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
        write(date, item, count, ChecklistEntry.DERIVED)
        return true
    }

    /**
     * Записать прогресс из производного канала, который правит свою отметку ПОВТОРНО, — поллер
     * подкастов дописывает минуты весь день (см. `PodcastMarker`). От [upsertIfAbsent] отличается
     * тем, что своя же строка не блокирует запись: пустой слот занимаем, свою строку правим,
     * ручную — не трогаем никогда. `true` — записали.
     *
     * Отдельный метод, а не флаг у [upsert]: у ручного ввода приоритет безусловный, и смешивать
     * эти две записи в одну ветку значит однажды перепутать, кто кого перекрывает.
     */
    fun upsertDerived(date: LocalDate, item: ChecklistItem, count: Int): Boolean {
        val existing = findByDateAndItem(date, item.id!!)
        if (existing != null && existing.source != ChecklistEntry.DERIVED) return false
        write(date, item, count, ChecklistEntry.DERIVED)
        return true
    }

    /** Записать прогресс пункта за дату; [count] зажимается в `0..target`. Ручной ввод. */
    fun upsert(date: LocalDate, item: ChecklistItem, count: Int) =
        write(date, item, count, ChecklistEntry.MANUAL)

    private fun write(date: LocalDate, item: ChecklistItem, count: Int, source: String) {
        val clamped = count.coerceIn(0, item.target)
        val entry = findByDateAndItem(date, item.id!!) ?: ChecklistEntry().apply {
            this.date = date
            itemId = item.id!!
            // IDENTITY-генерация вставляет строку немедленно — not-null поля заполнены выше.
            persist(this)
        }
        entry.count = clamped
        entry.source = source
    }
}
