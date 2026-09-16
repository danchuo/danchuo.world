package world.danchuo.summary

import kotlin.math.roundToInt

/**
 * The words an excerpt is captioned with. The conversation rules for a book and an episode are
 * identical and only the nouns differ, so keeping two near-identical prompts would just mean
 * fixing them one after the other later.
 */
data class SummaryVocabulary(
    /** Whose diary this is: a personal reading diary, or a listening one. */
    val diary: String,
    /** What the model is given: a book excerpt, or a transcript of an episode stretch. */
    val given: String,
    /** What the person did with the stretch: read it, or listened to it. */
    val didVerb: String,
    /** The whole the stretch was taken from: the book, or the episode (accusative). */
    val wholeAccusative: String,
    /** The same in the genitive — for the line "from 12% to 30% of the book". */
    val wholeGenitive: String,
    /** And in the nominative — for the closing-line rule ("not knowing this is a book"). */
    val wholeNominative: String,
    val titleLabel: String,
    val bylineLabel: String,
    val passedLabel: String,
    val sectionsLabel: String,
    /** Examples of stretches with nothing to summarise: they differ for a book and an episode. */
    val emptyExamples: String,
    /**
     * What occurs INSIDE a stretch without being its content. Empty means this source has no such
     * trouble and the rule stays out of the prompt: a spare instruction costs the model attention.
     */
    val skip: String = "",
)

/**
 * The conversation with the model about a passage. The answer is asked for as TEXT, not JSON: the
 * free lane runs simpler models that either lack structured output or spend half the response
 * budget on brackets. The one rule that matters: rely ONLY on the excerpt. PRD §5.16
 */
object SummaryPrompt {

    /**
     * What the model says when there is nothing to retell (contents page, copyright, adverts). The
     * word is deliberately NOT in the summary's language: a summary is written in the SOURCE's
     * language, and a model answering in English would faithfully translate a Russian refusal.
     */
    const val REFUSAL = "NO_CONTENT"

    /** The closing line's internal marker — one across all languages, and never served out. */
    const val TAKEAWAY_MARK = "TAKEAWAY:"

    private val READING = SummaryVocabulary(
        diary = "личный дневник чтения",
        given = "выдержку из книги",
        didVerb = "прочитал",
        wholeAccusative = "книгу",
        wholeGenitive = "книги",
        wholeNominative = "книга",
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
        wholeNominative = "подкаст",
        titleLabel = "Выпуск",
        bylineLabel = "Подкаст",
        passedLabel = "Прослушано за этот заход",
        sectionsLabel = "Темы в этом куске",
        emptyExamples = "реклама, джингл, перечисление спонсоров, анонс других выпусков",
        // An ad insert lands in the middle of a listened stretch, not only at its edges, so
        // refusing by rule 6 is not enough: without this rule the model spends a whole summary
        // point on sponsors (measured on a live episode).
        skip = "Рекламные вставки и упоминания спонсоров содержанием выпуска не считаются — " +
            "пропускай их молча и пункта из них не делай.",
    )

    fun vocabularyOf(kind: SummaryKind): SummaryVocabulary = when (kind) {
        SummaryKind.READING -> READING
        SummaryKind.PODCAST -> PODCAST
    }

    /**
     * Instructions per source kind, though the rules are the same for all. THE LANGUAGE RULE COMES
     * FIRST and is named explicitly, because the instruction is written in Russian and its mass
     * drags the answer into Russian. Measurements behind this and the closing line: PRD §5.16.
     */
    fun system(kind: SummaryKind): String = with(vocabularyOf(kind)) {
        val rules = """
        Ты ведёшь $diary. Тебе дают $given — ровно тот кусок, который человек $didVerb за один
        заход, — и ты рассказываешь, что в нём было.

        Правила:
        1. ЯЗЫК ОТВЕТА — ЯЗЫК ВЫДЕРЖКИ, и ничего больше. Выдержка на английском — весь ответ
           по-английски, включая строку итога. Эта инструкция написана по-русски, но это НЕ язык
           ответа: смотри только на выдержку.
        2. Опирайся ТОЛЬКО на выдержку. Не пересказывай $wholeAccusative целиком, не забегай
           вперёд и не добавляй того, чего в выдержке нет, даже если знаешь этот материал.
        3. От трёх до пяти пунктов, каждый — одно короткое предложение, маркер «- ».
        4. Последней строкой — «$TAKEAWAY_MARK » и одна фраза, которую можно было бы сказать, не
           зная, что это $wholeNominative: главная мысль куска сама по себе. «The conversation
           covers X» — плохо, «X происходит потому, что Y» — хорошо. Сам маркер служебный, на
           страницу он не попадёт.
        5. Спокойно и по делу, без оценок вроде «захватывающая глава» и без обращений к читателю.
        6. Если в выдержке нет содержания, которое можно пересказать ($emptyExamples), ответь
           ровно: $REFUSAL
        7. Никаких вступлений, заголовков и пояснений — только список и строка итога.
        8. Если в выдержке стоит «[…]», это пропуск: между кусками текст не связан, и придумывать
           связку между ними не надо.
        """.trimIndent()

        if (skip.isBlank()) rules else "$rules\n9. $skip"
    }

    /** The sitting's prompt: what captions the excerpt, and the excerpt itself. */
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
     * Model reply to a summary; `null` when there is nothing to tell (a refusal, emptiness, chatter
     * without a single point). An empty result BEATS a summary made of one introductory phrase:
     * the card then simply shows no button rather than lying about the content.
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

            // The list marker is stripped BEFORE the closing-line check: the model does now and
            // then format the closing line as a point, and without this it drifted into the
            // points while the closing line came out empty.
            val bullet = BULLET.find(line)
            val body = bullet?.groupValues?.get(2) ?: line

            val closing = TAKEAWAY.find(body)
            if (closing != null) {
                takeaway = clean(closing.groupValues[2]).takeIf { it.isNotEmpty() }
                continue
            }
            if (bullet != null) bullets += clean(body)
        }

        val kept = bullets.filter { it.isNotEmpty() }
        return if (kept.isEmpty()) null else Retelling(kept, takeaway)
    }

    /** A 0..1 fraction to whole percent — the same rounding as on the board card. */
    private fun percent(value: Double): String = "${(value.coerceIn(0.0, 1.0) * 100).roundToInt()}%"

    /** The model does now and then emphasise a word: markdown has no place in the diary. */
    private fun clean(text: String): String = text.replace(EMPHASIS, "").trim()

    /**
     * A refusal. Besides the internal [REFUSAL] we catch human phrasings too: a smaller model does
     * now and then answer with a sentence instead of the code, and taking that for a summary
     * would be the worst outcome of all.
     */
    private val REFUSAL_LINE = Regex(
        """^\W*(no[_\s]?content|не\s+получилось|no\s+summary)\b""",
        RegexOption.IGNORE_CASE,
    )

    /**
     * The closing line. The internal marker is one, but parsing accepts translations too: a model
     * writing the summary in the source's language may well translate the last line's label.
     */
    private val TAKEAWAY = Regex(
        """^[*_\s]*(takeaway|summary|итог|вывод|fazit|résumé|resumen)[*_\s]*:[*_\s]*(.+)$""",
        RegexOption.IGNORE_CASE,
    )
    private val BULLET = Regex("""^([-–—•*]|\d+[.)])\s+(.+)$""")
    private val EMPHASIS = Regex("""\*\*|\*|__|(?<=\s)_|_(?=[\s.,;:!?]|$)""")
}
