package world.danchuo.reading

import kotlin.math.min

/**
 * Свёртка суток чтения в отметки пункта «Чтение» (PRD §5.16).
 *
 * **Порог общий с подкастами — 25 минут на остановку**, и это не совпадение: обе привычки
 * меряются временем, а не «сколько прошёл». Полка читалки знает ровно время (страницы и проценты
 * у разных книг несопоставимы: 7% детектива и 7% справочника — разное чтение), поэтому отметка
 * считается по минутам, а проценты остаются украшением карточки.
 *
 * Считаем по СУММЕ дня, а не по сессиям: 20 минут утром и 20 вечером — это 40 минут чтения,
 * то есть одна закрытая остановка, хотя ни одна сессия порога не взяла. Рассмотрено и отклонено:
 * «остановка = сессия длиннее 25 минут» — она теряет ровно дробное чтение, которого у владельца
 * большинство.
 *
 * Карточек-заходов, в отличие от подкастов, отдельным слоем нет: там склейка нужна, потому что
 * запись рвёт сессию по 15-минутному молчанию опроса, а здесь строка сессии СРАЗУ пишется с
 * человеческим порогом (`session-gap-minutes`, те же 45 минут). Сессии и есть заходы.
 */
object ReadingDayRollup {

    /** Минут на одну остановку пункта — общее с подкастами. */
    const val OCCURRENCE_MINUTES = 25

    private const val SECONDS_PER_MINUTE = 60
    private const val OCCURRENCE_SECONDS = OCCURRENCE_MINUTES * SECONDS_PER_MINUTE

    /**
     * Сколько остановок пункта закрыто за сутки: `min(target, целых порогов в сумме)`.
     * Делим секунды, а не округлённые минуты, — 24:59 остаётся нулём, ровно 25:00 даёт единицу.
     */
    fun occurrences(totalSeconds: Int, target: Int): Int =
        if (totalSeconds <= 0) 0 else min(target, totalSeconds / OCCURRENCE_SECONDS)

    /** Прочитанные минуты для подписи пункта — вниз до целой. */
    fun minutes(totalSeconds: Int): Int = if (totalSeconds <= 0) 0 else totalSeconds / SECONDS_PER_MINUTE

    /**
     * Карточки дня: первые [max] сессий, перевалившие сумму через очередную 25-минутку —
     * то есть «каким заходом закрыта эта остановка». Правило общее с подкастами, и расхождения
     * у них одинаковые: часовой присест даёт две отметки и ОДНУ карточку (заход-то был один),
     * а два получасовых — две отметки и две карточки.
     *
     * Сессии должны приехать в хронологическом порядке — иначе «первой» окажется не та.
     */
    fun cards(sessions: List<ReadingSession>, max: Int): List<ReadingSession> {
        val cards = mutableListOf<ReadingSession>()
        var total = 0
        for (session in sessions) {
            if (cards.size >= max) break
            val closedBefore = total / OCCURRENCE_SECONDS
            total += session.readSeconds
            if (total / OCCURRENCE_SECONDS > closedBefore) cards += session
        }
        return cards
    }
}
