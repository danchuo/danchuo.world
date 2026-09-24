package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The conversation with the model about a finished chunk (PRD §5.16): what we give it and how we
 * read the answer. It replies in TEXT, not JSON, because the free lane runs simpler models where
 * structured output is unsupported or eats half the answer budget on brackets.
 */

/**
 * The format is deliberately crude — bullets and a final summary line — so parsing survives
 * markdown asterisks, a preamble before the list and a lost summary line.
 */
class SummaryPromptTest {

    private val book = SummaryTarget(
        kind = SummaryKind.READING,
        sessionId = 1,
        title = "Дюна",
        byline = "Фрэнк Герберт",
        from = 0.48,
        to = 0.53,
    )

    @Test
    fun `bullets survive any usual marker`() {
        val parsed = SummaryPrompt.parse(
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
        val parsed = SummaryPrompt.parse(
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
    fun `the closing line survives a list marker in front of it`() {
        // The model sometimes formats the summary as a bullet. Without stripping the marker BEFORE
        // the summary check it landed among the bullets and the summary line stayed empty.
        val parsed = SummaryPrompt.parse(
            """
            - Пауль уходит в пустыню.
            - Появляется червь.
            - TAKEAWAY: пустыня учит быстрее, чем учителя.
            """.trimIndent(),
        )!!

        assertEquals(listOf("Пауль уходит в пустыню.", "Появляется червь."), parsed.bullets)
        assertEquals("пустыня учит быстрее, чем учителя.", parsed.takeaway)
    }

    @Test
    fun `markdown emphasis inside a bullet is stripped`() {
        val parsed = SummaryPrompt.parse("- **Пауль** уходит в *пустыню*.")!!

        assertEquals(listOf("Пауль уходит в пустыню."), parsed.bullets)
    }

    @Test
    fun `the closing line is recognised in the language of the source`() {
        val parsed = SummaryPrompt.parse(
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
    fun `the closing line is asked for content, not for a description of the excerpt`() {
        // The model drifts to meta phrasing and the summary line turns into a table of contents
        // (measured on all six live episodes). We ask by rephrasing rather than by prohibition,
        // which measured worse. Line breaks in the prompt are layout, so compare by words.
        fun flat(kind: SummaryKind) = SummaryPrompt.system(kind).replace(Regex("""\s+"""), " ")

        assertTrue(flat(SummaryKind.READING).contains("не зная, что это книга"))
        assertTrue(flat(SummaryKind.PODCAST).contains("не зная, что это подкаст"))
    }

    @Test
    fun `the language rule comes first, ahead of the mass of russian instruction`() {
        // The instruction is entirely in Russian and its mass drags the answer into Russian even
        // for an English source (measured: 4 of 4). Hoisting the rule first holds it.
        for (kind in SummaryKind.entries) {
            val rules = SummaryPrompt.system(kind).substringAfter("Правила:")
            assertTrue(rules.trimStart().startsWith("1. ЯЗЫК ОТВЕТА"), "$kind: $rules")
        }
    }

    @Test
    fun `a refusal is not a retelling`() {
        assertNull(SummaryPrompt.parse("NO_CONTENT"))
        assertNull(SummaryPrompt.parse("НЕ ПОЛУЧИЛОСЬ"))
        assertNull(SummaryPrompt.parse("не получилось: в куске одно оглавление"))
        assertNull(SummaryPrompt.parse(""))
        assertNull(SummaryPrompt.parse(null))
        // A lone preamble with no bullets is not a retelling either.
        assertNull(SummaryPrompt.parse("Конечно! Сейчас расскажу."))
    }

    @Test
    fun `the prompt carries the facts of the sitting`() {
        val prompt = SummaryPrompt.user(book, SummaryExcerpt("…текст выдержки…", listOf("Глава 14")))

        assertTrue(prompt.contains("Дюна"))
        assertTrue(prompt.contains("Фрэнк Герберт"))
        assertTrue(prompt.contains("48%"))
        assertTrue(prompt.contains("53%"))
        assertTrue(prompt.contains("Глава 14"))
        assertTrue(prompt.contains("…текст выдержки…"))
    }

    @Test
    fun `an episode is described in the words of an episode, not a book`() {
        val episode = book.copy(
            kind = SummaryKind.PODCAST,
            title = "How Feelings Make Us Smarter",
            byline = "Hidden Brain",
        )

        val prompt = SummaryPrompt.user(episode, SummaryExcerpt("…расшифровка…"))
        val system = SummaryPrompt.system(SummaryKind.PODCAST)

        assertTrue(prompt.startsWith("Выпуск: How Feelings Make Us Smarter"), prompt)
        assertTrue(prompt.contains("Подкаст: Hidden Brain"), prompt)
        assertTrue(prompt.contains("Прослушано за этот заход"), prompt)
        assertTrue(system.contains("прослушал"), system)
        // Ads sit in the MIDDLE of the listened chunk, so "it is all ads" is not enough: without
        // its own rule the model spends a bullet on sponsors. A book needs no such rule.
        assertTrue(system.contains("спонсоров"), system)
        // The show's own pledge drive is an ad too: the model kept a bullet on a promo code.
        assertTrue(system.contains("промокод"), system)
        assertFalse(SummaryPrompt.system(SummaryKind.READING).contains("спонсоров"))
        // The rules are the same across kinds; only the nouns differ.
        assertTrue(system.contains(SummaryPrompt.REFUSAL))
        assertTrue(system.contains(SummaryPrompt.TAKEAWAY_MARK))
        assertTrue(SummaryPrompt.system(SummaryKind.READING).contains("прочитал"))
    }
}
