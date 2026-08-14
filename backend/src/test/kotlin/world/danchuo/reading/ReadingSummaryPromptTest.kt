package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Разговор с моделью про прочитанный кусок (PRD §5.16): что мы ей даём и как читаем ответ.
 *
 * Модель отвечает **текстом**, а не JSON, и это осознанно: бесплатная полоса — это модели вроде
 * llama-3.3, у которых структурированный вывод либо не поддержан, либо съедает половину бюджета
 * ответа на скобки. Зато формат простой до неприличия — пункты списком и строка «Итог:», —
 * поэтому разбор терпит и markdown-звёздочки, и вводную фразу перед списком, и потерянный итог.
 *
 * Проверяем:
 * - **пункты вытаскиваются** из любого привычного маркера (`-`, `•`, `*`, «1.»);
 * - **итог отделён** от пунктов и не остаётся среди них;
 * - **болтовня вокруг** списка выбрасывается, а не едет пунктом;
 * - **итог узнаётся на языке книги**: пересказ пишется на языке ВЫДЕРЖКИ (решение владельца),
 *   и подпись к последней строке модель вправе перевести вместе с ним;
 * - **отказ модели** (`NO_CONTENT` и человеческие его формы) — это `null`, а не пересказ из
 *   одной пустой строки;
 * - **промпт несёт факты захода**: название, автора и границы куска.
 */
class ReadingSummaryPromptTest {

    private val book = SummaryContext(
        title = "Дюна",
        author = "Фрэнк Герберт",
        startPercent = 0.48,
        endPercent = 0.53,
        chapters = listOf("Глава 14"),
    )

    @Test
    fun `bullets survive any usual marker`() {
        val parsed = ReadingSummaryPrompt.parse(
            """
            - Пауль уходит в пустыню.
            • Джессика говорит с фрименами.
            * Появляется червь.
            1. Отряд добирается до сиетча.
            """.trimIndent(),
        )!!

        assertEquals(
            listOf(
                "Пауль уходит в пустыню.",
                "Джессика говорит с фрименами.",
                "Появляется червь.",
                "Отряд добирается до сиетча.",
            ),
            parsed.bullets,
        )
        assertNull(parsed.takeaway)
    }

    @Test
    fun `the closing line is told apart from the bullets`() {
        val parsed = ReadingSummaryPrompt.parse(
            """
            Вот что было в этом куске:

            - Пауль уходит в пустыню.
            - Появляется червь.

            **Итог:** глава про то, как герой становится своим среди чужих.
            """.trimIndent(),
        )!!

        assertEquals(listOf("Пауль уходит в пустыню.", "Появляется червь."), parsed.bullets)
        assertEquals("глава про то, как герой становится своим среди чужих.", parsed.takeaway)
    }

    @Test
    fun `markdown emphasis inside a bullet is stripped`() {
        val parsed = ReadingSummaryPrompt.parse("- **Пауль** уходит в *пустыню*.")!!

        assertEquals(listOf("Пауль уходит в пустыню."), parsed.bullets)
    }

    @Test
    fun `the closing line is recognised in the language of the book`() {
        val parsed = ReadingSummaryPrompt.parse(
            """
            - The team ships a broken build.
            - Customers notice before the founders do.

            TAKEAWAY: a chapter about learning from what the market says.
            """.trimIndent(),
        )!!

        assertEquals(2, parsed.bullets.size)
        assertEquals("a chapter about learning from what the market says.", parsed.takeaway)
    }

    @Test
    fun `a refusal is not a retelling`() {
        assertNull(ReadingSummaryPrompt.parse("NO_CONTENT"))
        assertNull(ReadingSummaryPrompt.parse("НЕ ПОЛУЧИЛОСЬ"))
        assertNull(ReadingSummaryPrompt.parse("не получилось: в куске одно оглавление"))
        assertNull(ReadingSummaryPrompt.parse(""))
        assertNull(ReadingSummaryPrompt.parse(null))
        // Одна вводная фраза без единого пункта — тоже не пересказ.
        assertNull(ReadingSummaryPrompt.parse("Конечно! Сейчас расскажу."))
    }

    @Test
    fun `the prompt carries the facts of the sitting`() {
        val prompt = ReadingSummaryPrompt.user(book, "…текст выдержки…")

        assertTrue(prompt.contains("Дюна"))
        assertTrue(prompt.contains("Фрэнк Герберт"))
        assertTrue(prompt.contains("48%"))
        assertTrue(prompt.contains("53%"))
        assertTrue(prompt.contains("Глава 14"))
        assertTrue(prompt.contains("…текст выдержки…"))
    }
}
