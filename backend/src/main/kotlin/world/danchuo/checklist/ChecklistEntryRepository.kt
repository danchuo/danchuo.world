package world.danchuo.checklist

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Access to discipline marks. [upsert] keeps idempotency per (date, item): a repeat for the date
 * edits the same row, and progress is clamped into `0..target`.
 */
@ApplicationScoped
class ChecklistEntryRepository : PanacheRepository<ChecklistEntry> {

    fun listByDate(date: LocalDate): List<ChecklistEntry> = list("date", date)

    /** Marks over the inclusive date range `[from, to]`, for the calendar aggregator. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<ChecklistEntry> =
        list("date >= ?1 and date <= ?2", from, to)

    private fun findByDateAndItem(date: LocalDate, itemId: Long): ChecklistEntry? =
        find("date = ?1 and itemId = ?2", date, itemId).firstResult()

    /**
     * Writes progress only when (date, item) has no mark yet; `true` if it wrote. An existing row
     * means "already decided for that day", which is how manual input outranks a derived channel
     * such as [JournalMarker]. PRD §5.6
     */
    fun upsertIfAbsent(date: LocalDate, item: ChecklistItem, count: Int): Boolean {
        if (findByDateAndItem(date, item.id!!) != null) return false
        write(date, item, count, ChecklistEntry.DERIVED)
        return true
    }

    /**
     * Like [upsertIfAbsent] but for a channel that revises its own mark repeatedly (the podcast
     * poller tops up minutes all day): an empty slot or its own row is writable, a MANUAL row
     * never. Kept separate from [upsert] so manual priority cannot be lost in a flag. PRD §5.6
     */
    fun upsertDerived(date: LocalDate, item: ChecklistItem, count: Int): Boolean {
        val existing = findByDateAndItem(date, item.id!!)
        if (existing != null && existing.source != ChecklistEntry.DERIVED) return false
        write(date, item, count, ChecklistEntry.DERIVED)
        return true
    }

    /** Writes an item's progress for a date; [count] is clamped into `0..target`. Manual input. */
    fun upsert(date: LocalDate, item: ChecklistItem, count: Int) =
        write(date, item, count, ChecklistEntry.MANUAL)

    private fun write(date: LocalDate, item: ChecklistItem, count: Int, source: String) {
        val clamped = count.coerceIn(0, item.target)
        val entry = findByDateAndItem(date, item.id!!) ?: ChecklistEntry().apply {
            this.date = date
            itemId = item.id!!
            // IDENTITY generation inserts immediately — the not-null fields are set above.
            persist(this)
        }
        entry.count = clamped
        entry.source = source
    }
}
