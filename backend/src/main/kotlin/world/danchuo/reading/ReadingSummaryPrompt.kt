package world.danchuo.reading

import kotlin.math.roundToInt

/** Что известно про заход, кроме самого текста: чем подписать выдержку в промпте. */
data class SummaryContext(
    val title: String,
    val author: String?,
    val startPercent: Double,
    val endPercent: Double,
    /** Заголовки документов книги, попавших в кусок; пусто — книга без внятных заголовков. */
    val chapters: List<String> = emptyList(),
)

/** Разобранный ответ модели: пункты и (если дала) строка-итог. */
data class Retelling(
    val bullets: List<String>,
    val takeaway: String?,
)

/**
 * Разговор с моделью про прочитанный кусок (PRD §5.16).
 *
 * Ответ просим **текстом**, а не JSON: бесплатная полоса ([world.danchuo.llm.LlmLane]) — это
 * модели вроде llama-3.3, у которых структурированный вывод либо не поддержан вовсе, либо
 * съедает половину бюджета ответа на скобки. Формат зато простой до неприличия — список и
 * строка «Итог:», — а разбор терпит и markdown, и вводную фразу перед списком.
 *
 * Главное правило промпта: опираться ТОЛЬКО на выдержку. Пересказ «по памяти о книге» здесь
 * запрещён по той же причине, по которой мы вообще возим epub с полки: на публичном борде
 * уверенное враньё про книгу неотличимо от правды.
 */
object ReadingSummaryPrompt {

    /**
     * Модель говорит это, когда пересказывать нечего (оглавление, копирайты, список ссылок).
     * Слово служебное и намеренно не на языке пересказа: сам пересказ пишется на языке КНИГИ,
     * и русское «не получилось» модель, отвечающая по-английски, честно перевела бы — а мы бы
     * приняли перевод за содержание.
     */
    const val REFUSAL = "NO_CONTENT"

    /** Служебный маркер строки-итога — по той же причине один на все языки; наружу не идёт. */
    const val TAKEAWAY_MARK = "TAKEAWAY:"

    val SYSTEM = """
        Ты ведёшь личный дневник чтения. Тебе дают выдержку из книги — ровно тот кусок, который
        человек прочитал за один заход, — и ты рассказываешь, что в нём было.

        Правила:
        1. Опирайся ТОЛЬКО на выдержку. Не пересказывай книгу целиком, не забегай вперёд и не
           добавляй того, чего в выдержке нет, даже если знаешь эту книгу.
        2. От трёх до пяти пунктов, каждый — одно короткое предложение, маркер «- ».
        3. Последней строкой — «$TAKEAWAY_MARK » и одна фраза про весь кусок целиком. Сам маркер
           служебный, на страницу он не попадёт.
        4. ПИШИ НА ЯЗЫКЕ КНИГИ: выдержка на английском — пересказ по-английски, на русском —
           по-русски, и так далее. Язык определяй по самой выдержке, а не по этой инструкции.
        5. Спокойно и по делу, без оценок вроде «захватывающая глава» и без обращений к читателю.
        6. Если в выдержке нет содержания, которое можно пересказать (оглавление, выходные
           данные, список ссылок, сплошные сноски), ответь ровно: $REFUSAL
        7. Никаких вступлений, заголовков и пояснений — только список и строка итога.
        8. Если в выдержке стоит «[…]», это пропуск: между кусками текст не связан, и придумывать
           связку между ними не надо.
    """.trimIndent()

    /** Промпт захода: чем подписана выдержка и сама выдержка. */
    fun user(context: SummaryContext, excerpt: String): String = buildString {
        append("Книга: ").append(context.title).append('\n')
        context.author?.takeIf { it.isNotBlank() }?.let { append("Автор: ").append(it).append('\n') }
        append("Прочитано за этот заход: с ")
            .append(percent(context.startPercent)).append(" до ").append(percent(context.endPercent))
            .append(" книги\n")
        if (context.chapters.isNotEmpty()) {
            append("Разделы книги в этом куске: ").append(context.chapters.joinToString("; ")).append('\n')
        }
        append("\nВыдержка:\n")
        append(excerpt)
    }

    /**
     * Ответ модели → пересказ; `null` — пересказывать нечего (отказ, пустота, болтовня без
     * единого пункта). Пустой результат ЛУЧШЕ пересказа из одной вводной фразы: карточка тогда
     * просто не покажет кнопку, а не соврёт содержанием.
     */
    fun parse(reply: String?): Retelling? {
        val text = reply?.trim().orEmpty()
        if (text.isEmpty()) return null
        if (REFUSAL_LINE.containsMatchIn(text.lineSequence().first())) return null

        val bullets = ArrayList<String>()
        var takeaway: String? = null
        for (raw in text.lines()) {
            val line = raw.trim()
            if (line.isEmpty()) continue

            val closing = TAKEAWAY.find(line)
            if (closing != null) {
                takeaway = clean(closing.groupValues[2]).takeIf { it.isNotEmpty() }
                continue
            }
            BULLET.find(line)?.let { bullets += clean(it.groupValues[2]) }
        }

        val kept = bullets.filter { it.isNotEmpty() }
        return if (kept.isEmpty()) null else Retelling(kept, takeaway)
    }

    /** Доля 0..1 в целые проценты — тем же округлением, что на карточке борда. */
    private fun percent(value: Double): String = "${(value.coerceIn(0.0, 1.0) * 100).roundToInt()}%"

    /** Модель нет-нет да и выделит слово: markdown в дневнике ни к чему, снимаем. */
    private fun clean(text: String): String = text.replace(EMPHASIS, "").trim()

    /**
     * Отказ. Кроме служебного [REFUSAL] ловим и человеческие формулировки: модель поменьше
     * нет-нет да и ответит фразой вместо кода, и принять её за пересказ было бы хуже всего.
     */
    private val REFUSAL_LINE = Regex(
        """^\W*(no[_\s]?content|не\s+получилось|no\s+summary)\b""",
        RegexOption.IGNORE_CASE,
    )

    /**
     * Строка-итог. Служебный маркер один, но разбор принимает и переводы: модель, пишущая
     * пересказ на языке книги, вполне может перевести и подпись к последней строке.
     */
    private val TAKEAWAY = Regex(
        """^[*_\s]*(takeaway|summary|итог|вывод|fazit|résumé|resumen)[*_\s]*:[*_\s]*(.+)$""",
        RegexOption.IGNORE_CASE,
    )
    private val BULLET = Regex("""^([-–—•*]|\d+[.)])\s+(.+)$""")
    private val EMPHASIS = Regex("""\*\*|\*|__|(?<=\s)_|_(?=[\s.,;:!?]|$)""")
}
