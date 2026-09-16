package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * The `checklist` seam for the DERIVED podcast mark, sibling of [JournalMarker]: `spotify` counts
 * the minutes and calls here rather than reaching into another slice's repositories. It uses
 * `upsertDerived`, since unlike the journal this mark grows through the day (0 -> 1 -> 2). §5.6
 */
@ApplicationScoped
class PodcastMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /** How many stops the podcast item has; `null` when the item is gone or deactivated. */
    fun target(): Int? = checklistItems.findByKey(PODCAST_ITEM_KEY)?.target

    /**
     * Marks [occurrences] closed stops for [date]. `true` when written; `false` when the item is
     * missing, or the day was already decided by hand.
     */
    fun mark(date: LocalDate, occurrences: Int): Boolean {
        val item = checklistItems.findByKey(PODCAST_ITEM_KEY) ?: return false
        return checklistEntries.upsertDerived(date, item, occurrences)
    }

    private companion object {
        const val PODCAST_ITEM_KEY = "podcasts"
    }
}
