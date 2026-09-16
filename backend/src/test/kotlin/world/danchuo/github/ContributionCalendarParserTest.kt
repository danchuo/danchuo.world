package world.danchuo.github

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Parsing the public GitHub contribution-calendar fragment (PRD §5.4, registry I-01). The channel
 * is HTML, not an API, and the markup has already moved once, so the parser is suspicious by
 * design: what it does not understand it does not return, and an empty map means "no data".
 */
class ContributionCalendarParserTest {

    private fun day(d: String) = LocalDate.parse(d)

    /** A calendar cell as a live fragment (attribute order as GitHub serves it). */
    private fun cell(id: String, date: String, level: Int) =
        """<td tabindex="0" data-ix="0" aria-selected="false" style="width: 11px" data-date="$date" """ +
            """id="$id" data-level="$level" role="gridcell" data-view-component="true" """ +
            """class="ContributionCalendar-day">"""

    private fun tip(id: String, text: String) =
        """<tool-tip for="$id" popover="manual" data-type="label" class="sr-only">$text</tool-tip>"""

    @Test
    fun `reads the count from the day tooltip`() {
        val html = cell("c-0-0", "2026-07-28", 4) + tip("c-0-0", "15 contributions on July 28th.")

        assertEquals(mapOf(day("2026-07-28") to 15), ContributionCalendarParser.parse(html))
    }

    @Test
    fun `singular wording is a count too`() {
        val html = cell("c-0-1", "2026-07-31", 1) + tip("c-0-1", "1 contribution on July 31st.")

        assertEquals(1, ContributionCalendarParser.parse(html)[day("2026-07-31")])
    }

    /**
     * Skipping it would leave an empty day `null` forever, and the chip could not tell
     * "not collected" from "did not commit".
     */
    @Test
    fun `no contributions is a measured zero`() {
        val html = cell("c-0-2", "2026-07-30", 0) + tip("c-0-2", "No contributions on July 30th.")

        assertEquals(0, ContributionCalendarParser.parse(html)[day("2026-07-30")])
    }

    @Test
    fun `thousands separator survives`() {
        val html = cell("c-0-3", "2026-03-14", 4) + tip("c-0-3", "1,024 contributions on March 14th.")

        assertEquals(1024, ContributionCalendarParser.parse(html)[day("2026-03-14")])
    }

    @Test
    fun `reads a whole year of cells`() {
        val html = buildString {
            repeat(370) { i ->
                val date = day("2025-07-27").plusDays(i.toLong())
                append(cell("c-$i", date.toString(), i % 5))
                append(tip("c-$i", if (i % 5 == 0) "No contributions on X." else "${i % 5} contributions on X."))
            }
        }

        val parsed = ContributionCalendarParser.parse(html)

        assertEquals(370, parsed.size)
        assertEquals(0, parsed[day("2025-07-27")])
        assertEquals(4, parsed[day("2025-07-31")])
    }

    /**
     * The 0..4 fill level is not a count, and "about 3" is no use to the board — so a cell with
     * no tooltip stays silent rather than becoming a zero.
     */
    @Test
    fun `cell without a tooltip is skipped, neighbours survive`() {
        val html = cell("c-a", "2026-07-20", 3) +
            cell("c-b", "2026-07-21", 2) + tip("c-b", "2 contributions on July 21st.")

        val parsed = ContributionCalendarParser.parse(html)

        assertNull(parsed[day("2026-07-20")])
        assertEquals(2, parsed[day("2026-07-21")])
    }

    @Test
    fun `unparseable tooltip wording is skipped`() {
        val html = cell("c-x", "2026-07-19", 2) + tip("c-x", "вклады: много")

        assertTrue(ContributionCalendarParser.parse(html).isEmpty())
    }

    @Test
    fun `broken markup yields nothing rather than zeros`() {
        assertTrue(ContributionCalendarParser.parse("").isEmpty())
        assertTrue(ContributionCalendarParser.parse("<html><body>404</body></html>").isEmpty())
    }

    /**
     * A real slice of the profile fragment taken on 2026-07-31. The synthetic cases above check
     * the logic; this is the test that fails when GitHub's markup moves.
     */
    @Test
    fun `parses a live slice of the real fragment`() {
        val html = checkNotNull(
            javaClass.getResourceAsStream("/fixtures/github-contributions-fragment.html"),
        ).reader().use { it.readText() }

        val parsed = ContributionCalendarParser.parse(html)

        assertEquals(14, parsed.size)
        assertEquals(7, parsed[day("2026-07-18")])
        assertEquals(15, parsed[day("2026-07-28")])
        assertEquals(3, parsed[day("2026-07-31")])
        // Days with no contributions are zeros, not gaps.
        assertEquals(0, parsed[day("2026-07-25")])
        assertEquals(0, parsed[day("2026-07-30")])
    }

    /** The binding is by `for`: a foreign number must not leak into a neighbouring day. */
    @Test
    fun `tooltip binds to its own cell by id`() {
        val html = cell("c-1", "2026-07-10", 1) + cell("c-2", "2026-07-11", 3) +
            tip("c-2", "9 contributions on July 11th.") + tip("c-1", "1 contribution on July 10th.")

        val parsed = ContributionCalendarParser.parse(html)

        assertEquals(1, parsed[day("2026-07-10")])
        assertEquals(9, parsed[day("2026-07-11")])
    }
}
