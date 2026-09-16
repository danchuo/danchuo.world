package world.danchuo.github

import java.time.LocalDate

/**
 * Parses GitHub's public contribution-calendar fragment — a pure function where all the channel's
 * fragility is locked up. The count lives in the tooltip, not in a cell attribute (it moved once
 * already), so parsing is pessimistic and anything unrecognised drops out. PRD §5.15
 */
object ContributionCalendarParser {

    private val CELL = Regex("""<td\b[^>]*>""")
    private val DATE_ATTR = Regex("""\bdata-date="(\d{4}-\d{2}-\d{2})"""")
    private val ID_ATTR = Regex("""\bid="([^"]+)"""")
    private val TOOLTIP = Regex("""<tool-tip\b([^>]*)>([^<]*)</tool-tip>""")
    private val FOR_ATTR = Regex("""\bfor="([^"]+)"""")
    /** `15 contributions on July 28th.` / `1 contribution on ...` — thousands use a comma. */
    private val COUNT = Regex("""^\s*([\d,]+)\s+contribution""", RegexOption.IGNORE_CASE)
    /** `No contributions on July 30th.` — a measured zero, not "no data". */
    private val NO_COUNT = Regex("""^\s*No\s+contributions""", RegexOption.IGNORE_CASE)

    /**
     * Fragment html to `date -> contributions`, dated exactly as GitHub labelled it. An EMPTY map
     * means "did not parse" — markup moved, an error page arrived, the channel closed — and the
     * caller must then write nothing, or a channel failure would zero the whole history.
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

    /** `cell id -> contribution count` off the tooltips; unparsed forms are skipped. */
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
