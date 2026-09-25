package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * The `checklist` seam for the DERIVED reading mark, sibling of [PodcastMarker]: `reading` counts
 * the minutes and calls here. Time, not pages, because time is what the shelf knows; manual input
 * still outranks it and freezes the value, lower ones included. PRD §5.16, §5.6
 */
@ApplicationScoped
class ReadingMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /**
     * Marks [occurrences] closed stops for [date]. `true` when written; `false` when the item is
     * missing, or the day was already decided by hand.
     */
    fun mark(date: LocalDate, occurrences: Int): Boolean {
        val item = checklistItems.findByKey(READING_ITEM_KEY) ?: return false
        return checklistEntries.upsertDerived(date, item, occurrences)
    }

    private companion object {
        const val READING_ITEM_KEY = "reading"
    }
}
