package world.danchuo.github

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Разбор публичного фрагмента календаря вкладов GitHub (PRD §5.4, реестр I-01).
 *
 * Канал — **HTML, а не API**: у GitHub нет открытого эндпоинта под эти клетки (GraphQL,
 * где живёт `contributionsCollection`, отвечает 403 без токена). Поэтому парсер обязан
 * быть подозрительным: разметка уже менялась (числа переехали из `data-count` ячейки в
 * текст всплывающей подписи), и следующая правка не должна ронять приём.
 *
 * Контракт деградации простой: **не понял — не отдал**. Пустая карта наверх означает
 * «данных нет», и вызывающий по ней ничего не пишет (та же доктрина, что «пустой прогон
 * Health не стирает ночь») — вместо того чтобы записать всем дням честный на вид ноль.
 */
class ContributionCalendarParserTest {

    private fun day(d: String) = LocalDate.parse(d)

    /** Ячейка календаря в форме живого фрагмента (порядок атрибутов — как отдаёт GitHub). */
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
     * «No contributions» — это измеренный **ноль**, а не «нет данных»: день прожит, вкладов
     * не было. Пропустить его нельзя — иначе пустой день навсегда останется `null`, и чип
     * не сможет отличить «не собирали» от «не коммитил».
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
     * Ячейка без подписи (разметка поехала / подпись не отрисовалась) не превращается в ноль:
     * уровень заливки 0..4 в счёт не переводится, а «примерно 3» борду не нужно. День молчит,
     * соседи по фрагменту при этом доезжают — одна битая клетка не рушит весь прогон.
     */
    @Test
    fun `cell without a tooltip is skipped, neighbours survive`() {
        val html = cell("c-a", "2026-07-20", 3) +
            cell("c-b", "2026-07-21", 2) + tip("c-b", "2 contributions on July 21st.")

        val parsed = ContributionCalendarParser.parse(html)

        assertNull(parsed[day("2026-07-20")])
        assertEquals(2, parsed[day("2026-07-21")])
    }

    /** Подпись не в той форме (локаль/переписанный текст) — тоже пропуск, а не догадка. */
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
     * Якорь против живой разметки: срез настоящего фрагмента профиля, снятый 31.07.2026
     * (две недели ячеек с их подписями, как есть). Синтетические кейсы выше проверяют логику,
     * этот — что мы всё ещё узнаём то, что GitHub реально отдаёт. Поедет разметка — упадёт он.
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
        // Дни без вкладов — именно нули, а не пропуски.
        assertEquals(0, parsed[day("2026-07-25")])
        assertEquals(0, parsed[day("2026-07-30")])
    }

    /** Подпись привязана к ячейке по `for` — чужая цифра не должна протечь в соседний день. */
    @Test
    fun `tooltip binds to its own cell by id`() {
        val html = cell("c-1", "2026-07-10", 1) + cell("c-2", "2026-07-11", 3) +
            tip("c-2", "9 contributions on July 11th.") + tip("c-1", "1 contribution on July 10th.")

        val parsed = ContributionCalendarParser.parse(html)

        assertEquals(1, parsed[day("2026-07-10")])
        assertEquals(9, parsed[day("2026-07-11")])
    }
}
