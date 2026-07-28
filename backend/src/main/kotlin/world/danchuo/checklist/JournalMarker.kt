package world.danchuo.checklist

import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Публичный шов слайса `checklist` для **производной** отметки «дневник перед сном» (PRD §5.6).
 *
 * Пункт ставится не галочкой, а временем в приложении «Журнал»: оно приходит в HealthKit как
 * Mindful Minutes, слайс `health` считает вечернюю сумму и зовёт сюда. Соседний слайс не лазает
 * в чужие репозитории — так же, как `checklist` пишет день через `DayRecordService`.
 *
 * Приоритет ручного ввода: отметка ставится **только в пустоту**. Уже существующая строка
 * означает «за этот день решено» — прислал галочку интерактивным шорткатом, значит она и
 * останется, сколько бы минут ни насчитал следующий прогон Health.
 *
 * Отметка ставится только «сделано»: нуля производный канал не пишет никогда. Ноль занял бы
 * слот и заблокировал более поздний прогон того же вечера, а «мало минут» и «шорткат не достал»
 * по данным неразличимы — та же логика, по которой пустой прогон не стирает ночь (§5.4).
 */
@ApplicationScoped
class JournalMarker(
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
) {

    /** Отметить «дневник» за [date], если пункт ещё не решён; `true` — отметка записана. */
    fun markDone(date: LocalDate): Boolean {
        val item = checklistItems.findByKey(JOURNAL_ITEM_KEY) ?: return false
        return checklistEntries.upsertIfAbsent(date, item, item.target)
    }

    private companion object {
        const val JOURNAL_ITEM_KEY = "journal"
    }
}
