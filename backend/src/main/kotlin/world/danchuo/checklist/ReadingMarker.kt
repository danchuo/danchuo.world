package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Публичный шов слайса `checklist` для **производной** отметки чтения (PRD §5.16) — сосед по
 * образцу [PodcastMarker]: слайс `reading` считает минуты и зовёт сюда, в чужие репозитории не
 * лазая.
 *
 * Пункт «Чтение» существует с первой итерации чеклиста (сид 0020, target 2) и до сих пор
 * отмечался рукой из шортката. Теперь он производный от минут — ровно как подкасты: полка
 * читалки знает ВРЕМЯ чтения, а не страницы, поэтому порог тот же и считается так же.
 *
 * **Приоритет ручного ввода сохранён**, как у подкастов: прислал отметку с телефона — строка
 * становится ручной, и поллер её больше не трогает до конца суток. Обратная сторона честная:
 * запущенный шорткат ФИКСИРУЕТ значение, в том числе меньшее.
 */
@ApplicationScoped
class ReadingMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /** Сколько остановок у пункта чтения; `null` — пункта нет (деактивирован/удалён). */
    fun target(): Int? = checklistItems.findByKey(READING_ITEM_KEY)?.target

    /**
     * Проставить [occurrences] закрытых остановок за [date]. `true` — отметка записана;
     * `false` — пункта нет либо за этот день уже решено вручную.
     */
    fun mark(date: LocalDate, occurrences: Int): Boolean {
        val item = checklistItems.findByKey(READING_ITEM_KEY) ?: return false
        return checklistEntries.upsertDerived(date, item, occurrences)
    }

    private companion object {
        const val READING_ITEM_KEY = "reading"
    }
}
