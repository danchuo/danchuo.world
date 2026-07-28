package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.days.DayRecordService
import world.danchuo.monster.MonsterFlavorRepository
import java.time.LocalDate

/**
 * Оркестрация `ingest/daily` (PRD §5.6): ручной слой дня в один тап — имя дня,
 * прогресс пунктов дисциплины и вкус монстра. Слайс checklist «владеет» эндпоинтом,
 * но пишет через публичные швы соседей ([DayRecordService] — имя/вкус на дне,
 * [MonsterFlavorRepository] — резолв вкуса), не лазая в их БД.
 *
 * Семантика — **снапшот ручного ввода за день** (шорткат шлёт всё разом):
 * - `title` отсутствует/пуст ⇒ имя дня очищается; идемпотентная правка задним числом.
 * - `monsterFlavorKey` задан ⇒ ставится вкус и пункт `monster` = 1; `null`/нет ⇒
 *   «не пил» (вкус сбрасывается, пункт `monster` = 0). Пункт монстра — **производная**
 *   от вкуса (§5.6), ручной счётчик `monster` в `items` игнорируется.
 * - `items` — прогресс прочих пунктов, зажимается в `0..target`, upsert по (date,item).
 *
 * Пункт `journal` штатно ставится **производно** — минутами в приложении «Журнал» (см.
 * [JournalMarker]), поэтому в `items` его слать не нужно. Присланный — перекрывает минуты:
 * upsert пишет поверх всегда, а производный канал занимает только пустой слот. Это ручной
 * аварийный ход (писал на бумаге, отозван доступ к Health), а не штатный путь.
 */
@ApplicationScoped
class DailyIngestService(
    private val dayRecordService: DayRecordService,
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
    private val monsterFlavors: MonsterFlavorRepository,
) {

    fun ingest(
        date: LocalDate,
        title: String?,
        items: Map<String, Int>,
        monsterFlavorKey: String?,
    ) {
        // Вкус монстра: резолвим ключ (422 на опечатку), он же ведёт пункт monster.
        val flavor = monsterFlavorKey
            ?.takeIf { it.isNotBlank() }
            ?.let {
                monsterFlavors.findByKey(it)
                    ?: throw UnknownReferenceException("monster_flavor", it)
            }

        dayRecordService.applyDailyMeta(date, title, flavor?.id)

        // Прочие пункты дисциплины (monster ведём отдельно — он производная от вкуса).
        items.forEach { (key, count) ->
            if (key == MONSTER_ITEM_KEY) return@forEach
            val item = checklistItems.findByKey(key)
                ?: throw UnknownReferenceException("checklist_item", key)
            checklistEntries.upsert(date, item, count)
        }

        // Производный пункт monster: выбран вкус ⇒ 1, «не пил» ⇒ 0.
        checklistItems.findByKey(MONSTER_ITEM_KEY)?.let { monsterItem ->
            checklistEntries.upsert(date, monsterItem, if (flavor != null) 1 else 0)
        }
    }

    private companion object {
        const val MONSTER_ITEM_KEY = "monster"
    }
}
