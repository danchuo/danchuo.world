package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Public seam for the DERIVED "journal before sleep" mark (PRD §5.6): `health` sums the evening
 * Mindful Minutes and calls in here, instead of reaching into another slice's repositories.
 * Manual input wins — see [markDone] for the two rules that protect it.
 */
@ApplicationScoped
class JournalMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /**
     * Marks `journal` for [date] ONLY into emptiness: an existing row means the day is already
     * decided by hand and must survive any later Health run. Never writes a zero either — a zero
     * would take the slot, and "too few minutes" and "shortcut never fired" look identical (§5.4).
     */
    fun markDone(date: LocalDate): Boolean {
        val item = checklistItems.findByKey(JOURNAL_ITEM_KEY) ?: return false
        return checklistEntries.upsertIfAbsent(date, item, item.target)
    }

    private companion object {
        const val JOURNAL_ITEM_KEY = "journal"
    }
}
