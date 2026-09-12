package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Публичный шов слайса `checklist` для **производной** отметки подкастов (PRD §5.6) — сосед по
 * образцу [JournalMarker]: слайс `spotify` считает минуты и зовёт сюда, в чужие репозитории не лазая.
 *
 * Отличие от дневника: тот отмечается один раз за вечер, а подкасты набираются весь день, и
 * отметка растёт по ходу (0 → 1 → 2). Поэтому пишем через `upsertDerived`, а не `upsertIfAbsent`:
 * своя же строка не должна блокировать следующий прогон.
 *
 * **Ручной ввод главнее счёта:** интерактивный шорткат остаётся каналом и всегда старше
 * поллера. Прислал отметку с телефона — строка становится ручной, и поллер её
 * больше не трогает до конца суток, даже если насчитает больше. Обратная сторона честная:
 * запущенный шорткат ФИКСИРУЕТ значение, в том числе меньшее.
 */
@ApplicationScoped
class PodcastMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /** Сколько остановок у пункта подкастов; `null` — пункта нет (деактивирован/удалён). */
    fun target(): Int? = checklistItems.findByKey(PODCAST_ITEM_KEY)?.target

    /**
     * Проставить [occurrences] закрытых остановок за [date]. `true` — отметка записана;
     * `false` — пункта нет либо за этот день уже решено вручную.
     */
    fun mark(date: LocalDate, occurrences: Int): Boolean {
        val item = checklistItems.findByKey(PODCAST_ITEM_KEY) ?: return false
        return checklistEntries.upsertDerived(date, item, occurrences)
    }

    private companion object {
        const val PODCAST_ITEM_KEY = "podcasts"
    }
}
