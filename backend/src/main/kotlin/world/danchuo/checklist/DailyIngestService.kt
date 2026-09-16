package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.days.DayRecordService
import java.time.LocalDate

/**
 * Orchestrates `ingest/daily` as a SNAPSHOT of one day's manual entry: an absent title clears the
 * day name, monster travels by its own field (a counter in `items` is ignored), everything else
 * is clamped to `0..target`. The day name is written through [DayRecordService]. PRD §5.6
 */
@ApplicationScoped
class DailyIngestService(
    private val dayRecordService: DayRecordService,
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    fun ingest(
        date: LocalDate,
        title: String?,
        items: Map<String, Int>,
        monster: String?,
    ) {
        dayRecordService.applyDailyMeta(date, title)

        items.forEach { (key, count) ->
            if (key == MONSTER_ITEM_KEY) return@forEach
            val item = checklistItems.findByKey(key)
                ?: throw UnknownReferenceException("checklist_item", key)
            checklistEntries.upsert(date, item, count)
        }

        // The mark is written ALWAYS: its presence is what says "the shortcut ran that day",
        // while a missing row reads as "not recorded", not as "did not drink". PRD §5.6
        checklistItems.findByKey(MONSTER_ITEM_KEY)?.let { monsterItem ->
            checklistEntries.upsert(date, monsterItem, if (!monster.isNullOrBlank()) 1 else 0)
        }
    }

    private companion object {
        const val MONSTER_ITEM_KEY = "monster"
    }
}
