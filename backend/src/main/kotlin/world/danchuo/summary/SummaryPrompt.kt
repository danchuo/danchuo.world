package world.danchuo.summary

import kotlin.math.roundToInt

/**
 * Слова, которыми подписывается выдержка. Правила разговора у книги и у выпуска одни и те же —
 * разными оказываются ровно существительные, и держать ради них два почти одинаковых промпта
 * значило бы чинить их потом по очереди.
 */
data class SummaryVocabulary(
    /** Чей это дневник: «личный дневник чтения» / «прослушанного». */
    val diary: String,
    /** Что дают модели: «выдержку из книги» / «расшифровку куска выпуска». */
    val given: String,
    /** Что человек с этим куском сделал: «прочитал» / «прослушал». */
    val didVerb: String,
    /** Целое, от которого взят кусок: «книгу» / «выпуск» (винительный падеж). */
    val wholeAccusative: String,
    /** Оно же в родительном — для строки «с 12% до 30% книги». */
    val wholeGenitive: String,
    val titleLabel: String,
    val bylineLabel: String,
    val passedLabel: String,
    val sectionsLabel: String,
    /** Примеры кусков, в которых пересказывать нечего: они у книги и у выпуска разные. */
    val emptyExamples: String,
)

/**
 * Разговор с моделью про пройденный за заход кусок (PRD §5.16).
 *
 * Ответ просим **текстом**, а не JSON: бесплатная полоса ([world.danchuo.llm.LlmLane]) — это
 * модели вроде llama-3.3, у которых структурированный вывод либо не поддержан вовсе, либо
 * съедает половину бюджета ответа на скобки. Формат зато простой до неприличия — список и
 * строка «Итог:», — а разбор терпит и markdown, и вводную фразу перед списком.
 *
 * Главное правило промпта: опираться ТОЛЬКО на выдержку. Пересказ «по памяти» здесь запрещён по
 * той же причине, по которой мы вообще возим epub с полки: на публичном борде уверенное враньё
 * про книгу неотличимо от правды.
 */
object SummaryPrompt {

    /**
     * Модель говорит это, когда пересказывать нечего (оглавление, копирайты, реклама). Слово
     * служебное и намеренно не на языке пересказа: сам пересказ пишется на языке ИСТОЧНИКА, и
     * русское «не получилось» модель, отвечающая по-английски, честно перевела бы — а мы бы
     * приняли перевод за содержание.
     */
    const val REFUSAL = "NO_CONTENT"

    /** Служебный маркер строки-итога — по той же причине один на все языки; наружу не идёт. */
    const val TAKEAWAY_MARK = "TAKEAWAY:"

    private val READING = SummaryVocabulary(
        diary = "личный дневник чтения",
        given = "выдержку из книги",
        didVerb = "прочитал",
        wholeAccusative = "книгу",
        wholeGenitive = "книги",
        titleLabel = "Книга",
        bylineLabel = "Автор",
        passedLabel = "Прочитано за этот заход",
        sectionsLabel = "Разделы книги в этом куске",
        emptyExamples = "оглавление, выходные данные, список ссылок, сплошные сноски",
    )

    private val PODCAST = SummaryVocabulary(
        diary = "личный дневник прослушанного",
        given = "расшифровку куска подкаста",
        didVerb = "прослушал",
        wholeAccusative = "выпуск",
        wholeGenitive = "выпуска",
        titleLabel = "Выпуск",
        bylineLabel = "Подкаст",
        passedLabel = "Прослушано за этот заход",
        sectionsLabel = "Темы в этом куске",
        emptyExamples = "реклама, джингл, перечисление спонсоров, анонс других выпусков",
    )

    fun vocabularyOf(kind: SummaryKind): SummaryVocabulary = when (kind) {
        SummaryKind.READING -> READING
        SummaryKind.PODCAST -> PODCAST
    }

    /** Инструкция разговора — своя на вид источника, но правила во всех одни. */
    fun system(kind: SummaryKind): String = with(vocabularyOf(kind)) {
        """
        Ты ведёшь $diary. Тебе дают $given — ровно тот кусок, который человек $didVerb за один
        заход, — и ты рассказываешь, что в нём было.

        Правила:
        1. Опирайся ТОЛЬКО на выдержку. Не пересказывай $wholeAccusative целиком, не забегай
           вперёд и не добавляй того, чего в выдержке нет, даже если знаешь этот материал.
        2. От трёх до пяти пунктов, каждый — одно короткое предложение, маркер «- ».
        3. Последней строкой — «$TAKEAWAY_MARK » и одна фраза про весь кусок целиком. Сам маркер
           служебный, на страницу он не попадёт.
        4. ПИШИ НА ЯЗЫКЕ ИСТОЧНИКА: выдержка на английском — пересказ по-английски, на русском —
           по-русски, и так далее. Язык определяй по самой выдержке, а не по этой инструкции.
        5. Спокойно и по делу, без оценок вроде «захватывающая глава» и без обращений к читателю.
        6. Если в выдержке нет содержания, которое можно пересказать ($emptyExamples), ответь
           ровно: $REFUSAL
        7. Никаких вступлений, заголовков и пояснений — только список и строка итога.
        8. Если в выдержке стоит «[…]», это пропуск: между кусками текст не связан, и придумывать
           связку между ними не надо.
        """.trimIndent()
    }

    /** Промпт захода: чем подписана выдержка и сама выдержка. */
    fun user(target: SummaryTarget, excerpt: SummaryExcerpt): String =
        with(vocabularyOf(target.kind)) {
            buildString {
                append(titleLabel).append(": ").append(target.title).append('\n')
                target.byline?.takeIf { it.isNotBlank() }
                    ?.let { append(bylineLabel).append(": ").append(it).append('\n') }
                append(passedLabel).append(": с ")
                    .append(percent(target.from)).append(" до ").append(percent(target.to))
                    .append(' ').append(wholeGenitive).append('\n')
                if (excerpt.sections.isNotEmpty()) {
                    append(sectionsLabel).append(": ").append(excerpt.sections.joinToString("; ")).append('\n')
                }
                append("\nВыдержка:\n")
                append(excerpt.text)
            }
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
     * пересказ на языке источника, вполне может перевести и подпись к последней строке.
     */
    private val TAKEAWAY = Regex(
        """^[*_\s]*(takeaway|summary|итог|вывод|fazit|résumé|resumen)[*_\s]*:[*_\s]*(.+)$""",
        RegexOption.IGNORE_CASE,
    )
    private val BULLET = Regex("""^([-–—•*]|\d+[.)])\s+(.+)$""")
    private val EMPHASIS = Regex("""\*\*|\*|__|(?<=\s)_|_(?=[\s.,;:!?]|$)""")
}
