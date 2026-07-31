package world.danchuo.github

import java.time.LocalDate

/**
 * Разбор публичного фрагмента календаря вкладов (`GET /users/{login}/contributions`) —
 * чистая функция, вся хрупкость канала заперта здесь (PRD §5.4, реестр I-01).
 *
 * **Почему HTML, а не API.** Открытого эндпоинта под календарь у GitHub нет: REST его
 * никогда не отдавал, а GraphQL, где живёт `contributionsCollection`, требует токен на
 * КАЖДЫЙ запрос (без него — 403). Публичная лента событий не годится отдельно: приватные
 * репозитории в неё не попадают, а у владельца вся работа в приватном. Фрагмент, которым
 * профиль рисует свою же сетку, — единственный канал, отдающий приватные вклады без токена.
 *
 * Форма живой разметки (снята 31.07.2026):
 * ```
 * <td ... data-date="2026-07-28" id="contribution-day-component-4-52" data-level="4" ...>
 * <tool-tip for="contribution-day-component-4-52" ...>15 contributions on July 28th.</tool-tip>
 * ```
 * Число живёт в подписи, а не в атрибуте ячейки (раньше был `data-count` — уже переехало
 * однажды). Поэтому разбор **пессимистичный**: атрибуты читаются по одному (порядок ничего
 * не значит), связь «ячейка ↔ подпись» — по `id`/`for`, а всё непонятое молча выпадает.
 * Уровень заливки `data-level` (0..4) в счёт НЕ переводится: «примерно 3» борду не нужно,
 * и лучше молчание, чем правдоподобная цифра.
 */
object ContributionCalendarParser {

    private val CELL = Regex("""<td\b[^>]*>""")
    private val DATE_ATTR = Regex("""\bdata-date="(\d{4}-\d{2}-\d{2})"""")
    private val ID_ATTR = Regex("""\bid="([^"]+)"""")
    private val TOOLTIP = Regex("""<tool-tip\b([^>]*)>([^<]*)</tool-tip>""")
    private val FOR_ATTR = Regex("""\bfor="([^"]+)"""")
    /** `15 contributions on July 28th.` / `1 contribution on …` — тысячи через запятую. */
    private val COUNT = Regex("""^\s*([\d,]+)\s+contribution""", RegexOption.IGNORE_CASE)
    /** `No contributions on July 30th.` — измеренный ноль, а не «нет данных». */
    private val NO_COUNT = Regex("""^\s*No\s+contributions""", RegexOption.IGNORE_CASE)

    /**
     * `html` фрагмента → `дата → число вкладов`. Даты — как их подписал сам GitHub
     * (перебить корзину нечем, см. врез про границу суток в PRD §5.4).
     *
     * Пустая карта = «не разобрали»: разметка поехала, пришла страница ошибки, канал закрыли.
     * Вызывающий по ней НЕ пишет ничего — иначе сбой канала обнулил бы всю историю.
     */
    fun parse(html: String): Map<LocalDate, Int> {
        val counts = tooltipCounts(html)
        if (counts.isEmpty()) return emptyMap()

        val result = LinkedHashMap<LocalDate, Int>()
        for (tag in CELL.findAll(html)) {
            val cell = tag.value
            val date = DATE_ATTR.find(cell)?.groupValues?.get(1) ?: continue
            val id = ID_ATTR.find(cell)?.groupValues?.get(1) ?: continue
            val count = counts[id] ?: continue
            val parsedDate = runCatching { LocalDate.parse(date) }.getOrNull() ?: continue
            result[parsedDate] = count
        }
        return result
    }

    /** `id ячейки → число вкладов` по всплывающим подписям; непонятые формы пропускаются. */
    private fun tooltipCounts(html: String): Map<String, Int> {
        val counts = HashMap<String, Int>()
        for (m in TOOLTIP.findAll(html)) {
            val id = FOR_ATTR.find(m.groupValues[1])?.groupValues?.get(1) ?: continue
            val label = m.groupValues[2]
            val count = when {
                NO_COUNT.containsMatchIn(label) -> 0
                else -> COUNT.find(label)?.groupValues?.get(1)?.replace(",", "")?.toIntOrNull()
            } ?: continue
            counts[id] = count
        }
        return counts
    }
}
