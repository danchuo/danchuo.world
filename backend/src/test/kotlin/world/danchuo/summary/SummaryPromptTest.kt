package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Разговор с моделью про пройденный кусок (PRD §5.16): что мы ей даём и как читаем ответ.
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
 * - **итог узнаётся на языке источника**: пересказ пишется на языке ВЫДЕРЖКИ (решение
 *   владельца), и подпись к последней строке модель вправе перевести вместе с ним;
 * - **отказ модели** (`NO_CONTENT` и человеческие его формы) — это `null`, а не пересказ из
 *   одной пустой строки;
 * - **промпт несёт факты захода**: название, подпись и границы куска;
 * - **словарь следует виду источника**: у книги и у выпуска правила одни, а существительные
 *   разные — иначе дневник рассказывал бы про «книгу» под карточкой подкаста.
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
        // Модель нет-нет да и оформит итог пунктом. Без снятия маркера ДО проверки на итог он
        // уезжал в пункты, а строка-итог оставалась пустой — поймано на живом заходе.
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
        // Модель тянет на мета-формулировку — «разговор охватывает…» — и строка-итог
        // превращается в оглавление вместо содержания (замерено на живых выпусках: так вышло у
        // всех шести). Просим переформулировкой, а не запретом: замер показал, что запрет либо
        // не работает, либо перетягивает ответ на язык инструкции.
        // Переносы строк в промпте — дело вёрстки, а не смысла: сравниваем по словам.
        fun flat(kind: SummaryKind) = SummaryPrompt.system(kind).replace(Regex("""\s+"""), " ")

        assertTrue(flat(SummaryKind.READING).contains("не зная, что это книга"))
        assertTrue(flat(SummaryKind.PODCAST).contains("не зная, что это подкаст"))
    }

    @Test
    fun `the language rule comes first, ahead of the mass of russian instruction`() {
        // Инструкция целиком по-русски, и её масса перетягивает ответ на русский даже для
        // англоязычного источника (замер: 4 из 4). Поднятое вперёд правило это держит.
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
        // Одна вводная фраза без единого пункта — тоже не пересказ.
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
        // Реклама садится в СЕРЕДИНУ прослушанного куска, поэтому отказа «тут одна реклама»
        // мало: без отдельного правила модель тратит на спонсоров пункт пересказа (замерено
        // на живом выпуске Huberman Lab). Книге это правило ни к чему — и его там нет.
        assertTrue(system.contains("спонсоров"), system)
        assertFalse(SummaryPrompt.system(SummaryKind.READING).contains("спонсоров"))
        // Правила при этом те же самые — расходятся только существительные.
        assertTrue(system.contains(SummaryPrompt.REFUSAL))
        assertTrue(system.contains(SummaryPrompt.TAKEAWAY_MARK))
        assertTrue(SummaryPrompt.system(SummaryKind.READING).contains("прочитал"))
    }
}
