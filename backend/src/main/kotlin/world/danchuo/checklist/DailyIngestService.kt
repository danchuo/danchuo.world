package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.days.DayPhotoService
import world.danchuo.days.DayRecordService
import world.danchuo.film.ProcessedImage
import java.time.LocalDate

/**
 * `ingest/daily` as a SNAPSHOT of one day's manual entry: absent title or activities clear them,
 * the monster comes from the activity list or its own field (never an `items` counter), counts
 * clamp to `0..target`; only an absent photo keeps the stored one. PRD §5.6
 */
@ApplicationScoped
class DailyIngestService(
    private val dayRecordService: DayRecordService,
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
    private val dayPhotos: DayPhotoService,
) {

    fun ingest(
        date: LocalDate,
        title: String?,
        items: Map<String, Int>,
        monster: String?,
        activities: List<String> = emptyList(),
        photo: ProcessedImage? = null,
    ) {
        // Split before any write: an unknown name must fail the request with nothing stored.
        val picked = activities.flatMap { it.split('\n', ',') }.map { it.trim() }.filter { it.isNotEmpty() }
        val drank = !monster.isNullOrBlank() || picked.any { it.lowercase() in MONSTER_NAMES }
        val done = picked.filterNot { it.lowercase() in MONSTER_NAMES }
            .map { Activity.parse(it) ?: throw UnknownReferenceException("activity", it) }
            .toSet()

        dayRecordService.applyDailyMeta(date, title, Activity.entries.filter { it in done }.map { it.key })
        photo?.let { dayPhotos.store(date, it) }

        items.forEach { (key, count) ->
            if (key == MONSTER_ITEM_KEY) return@forEach
            val item = checklistItems.findByKey(key)
                ?: throw UnknownReferenceException("checklist_item", key)
            checklistEntries.upsert(date, item, count)
        }

        // The mark is written ALWAYS: its presence is what says "the shortcut ran that day",
        // while a missing row reads as "not recorded", not as "did not drink". PRD §5.6
        checklistItems.findByKey(MONSTER_ITEM_KEY)?.let { monsterItem ->
            checklistEntries.upsert(date, monsterItem, if (drank) 1 else 0)
        }
    }

    private companion object {
        const val MONSTER_ITEM_KEY = "monster"

        /** How the monster is named in the activity list: its key or the shortcut's label. */
        val MONSTER_NAMES = setOf(MONSTER_ITEM_KEY, "монстр")
    }
}
