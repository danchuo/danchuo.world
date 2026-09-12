package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.days.DayRecordService
import java.time.LocalDate

/**
 * Оркестрация `ingest/daily` (PRD §5.6): ручной слой дня в один тап — имя дня, прогресс
 * пунктов дисциплины и монстр. Слайс checklist «владеет» эндпоинтом, но имя дня пишет через
 * публичный шов соседа ([DayRecordService]), не лазая в его БД.
 *
 * Семантика — **снапшот ручного ввода за день** (шорткат шлёт всё разом):
 * - `title` отсутствует/пуст ⇒ имя дня очищается; идемпотентная правка задним числом.
 * - `monster` непустой ⇒ пункт `monster` = 1 («пил»), пустой/нет ⇒ 0 («не пил»). Ручной
 *   счётчик `monster` в `items` игнорируется: у монстра свой канал, иначе один факт приезжал
 *   бы двумя путями и они могли бы разойтись.
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
) {

    fun ingest(
        date: LocalDate,
        title: String?,
        items: Map<String, Int>,
        monster: String?,
    ) {
        dayRecordService.applyDailyMeta(date, title)

        // Прочие пункты дисциплины (monster ведём отдельно — у него свой канал).
        items.forEach { (key, count) ->
            if (key == MONSTER_ITEM_KEY) return@forEach
            val item = checklistItems.findByKey(key)
                ?: throw UnknownReferenceException("checklist_item", key)
            checklistEntries.upsert(date, item, count)
        }

        // Монстр: значение непустое ⇒ пил, пустое/нет ⇒ не пил. ЧТО именно прислали — неважно:
        // шорткат до сих пор шлёт название вкуса, и он остаётся рабочим без правок на телефоне.
        // Отметка пишется ВСЕГДА — её наличие и означает «шорткат за день отработал» (§5.6),
        // а отсутствие строки читается как «не отмечали», а не как «не пил».
        checklistItems.findByKey(MONSTER_ITEM_KEY)?.let { monsterItem ->
            checklistEntries.upsert(date, monsterItem, if (!monster.isNullOrBlank()) 1 else 0)
        }
    }

    private companion object {
        const val MONSTER_ITEM_KEY = "monster"
    }
}
