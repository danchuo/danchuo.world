package world.danchuo.reading

import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile

/** Документ спайна: сколько он весит в исходнике и что в нём написано словами. */
data class EpubSection(
    /** Заголовок документа (`<title>`, иначе первый `<h1>`); `null` — безымянный. */
    val title: String?,
    /**
     * Длина ИСХОДНИКА документа в знаках — вместе с разметкой. Это не любопытство, а шкала:
     * долю прочитанного читалка считает по весу документов, а не по числу глав, и срез обязан
     * пользоваться той же линейкой (см. [EpubBook.excerpt]).
     */
    val rawChars: Int,
    /** Текст без разметки: абзацы разделены переводом строки. */
    val text: String,
)

/**
 * Книга, разобранная в плоский текст: документы спайна в порядке чтения.
 *
 * Зачем вообще нужен исходный текст: пересказ прочитанного куска (PRD §5.16) делается ТОЛЬКО по
 * нему. Пересказ «по памяти модели» рассмотрен и отклонён — на публичном борде он однажды
 * уверенно соврал бы про книгу, которой модель не знает, и отличить это было бы нечем.
 */
class EpubBook(val sections: List<EpubSection>) {

    private val totalRaw: Int = sections.sumOf { it.rawChars }.coerceAtLeast(1)

    /** Заголовки документов, попавших в кусок `[from, to]` — контекст для промпта. */
    fun titlesIn(from: Double, to: Double): List<String> {
        val first = locate(from).section
        val last = locate(to).section
        return sections.subList(first, (last + 1).coerceAtMost(sections.size))
            .mapNotNull { it.title?.takeIf { t -> t.isNotBlank() } }
            .distinct()
    }

    /**
     * Текст между долями [from] и [to] — тот самый кусок, который владелец прошёл за заход.
     *
     * Доли ложатся на шкалу ВЕСА документов, как их считает читалка: глава на восемь килобайт
     * занимает на ней в десять раз больше места, чем глава на восемьсот байт, — раскладка «по
     * числу глав» промахнулась бы на десятки процентов. Внутри документа доля переводится в
     * знаки уже по его собственному тексту.
     *
     * Границы кусочка НЕ раздвигаются вперёд: за `to` начинается непрочитанное, и захватить его
     * значило бы спойлерить владельцу его же книгу. Промах шкалы гасится назад — окном перед
     * началом (у нулевого куска оно единственное, что вообще можно пересказать).
     *
     * [maxChars] — потолок выдержки: он держит один вызов модели внутри самого скупого
     * free-лимита (у Groq это 8–12 тыс. токенов в минуту), а на длинных заходах ещё и режет
     * ожидание ответа. Заход, который в потолок не влез, режется НЕ по началу, а окнами по всей
     * длине (см. [cap]): пересказ обязан дойти до места, где владелец остановился.
     */
    fun excerpt(from: Double, to: Double, maxChars: Int): String {
        val end = to.coerceIn(0.0, 1.0)
        // Пустой (или вывернутый) диапазон — не повод остаться без пересказа: окно назад от
        // точки остановки отвечает на тот же вопрос «что это было».
        val start = from.coerceIn(0.0, end).let { if (end - it >= MIN_SPAN) it else end - MIN_SPAN }
            .coerceAtLeast(0.0)

        val head = locate(start)
        val tail = locate(end)
        val text = buildString {
            for (i in head.section..tail.section) {
                val body = sections[i].text
                val cut = body.substring(
                    if (i == head.section) head.offset.coerceAtMost(body.length) else 0,
                    if (i == tail.section) tail.offset.coerceAtMost(body.length) else body.length,
                )
                if (cut.isBlank()) continue
                if (isNotEmpty()) append("\n\n")
                append(cut.trim())
            }
        }
        return cap(text, maxChars)
    }

    /** Доля → место в книге: какой документ и сколько знаков от его начала. */
    private fun locate(fraction: Double): Position {
        var passed = 0
        val target = fraction.coerceIn(0.0, 1.0) * totalRaw
        for ((index, section) in sections.withIndex()) {
            val next = passed + section.rawChars
            if (target <= next || index == sections.lastIndex) {
                val inside = if (section.rawChars == 0) 0.0 else (target - passed) / section.rawChars
                return Position(index, (inside.coerceIn(0.0, 1.0) * section.text.length).toInt())
            }
            passed = next
        }
        return Position(0, 0)
    }

    /**
     * Ужать выдержку до потолка.
     *
     * Длинный заход не обрезается по началу: тогда пересказ обрывался бы на середине куска и
     * молчал ровно про то место, где владелец закрыл книгу, — а это самое памятное. Вместо
     * обрезки берём несколько равномерных окон по всей длине куска, последнее — впритык к концу.
     * Пропуски отмечены явно, чтобы модель видела разрывы, а не сочиняла мостики между ними.
     *
     * Совсем маленький потолок (меньше [MIN_WINDOW] на окно) окнами не нарезать — там честнее
     * одна связная выдержка от начала.
     */
    private fun cap(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val budget = maxChars - (WINDOWS - 1) * GAP.length
        if (budget / WINDOWS < MIN_WINDOW) return word(text, maxChars)

        val window = budget / WINDOWS
        val step = (text.length - window) / (WINDOWS - 1)
        return (0 until WINDOWS).joinToString(GAP) { i ->
            val start = if (i == WINDOWS - 1) text.length - window else i * step
            word(text.substring(start, start + window), window).trim()
        }
    }

    /** Обрезка по границе слова, чтобы выдержка не обрывалась на полубукве. */
    private fun word(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val cut = text.take(maxChars)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace > maxChars / 2) cut.take(lastSpace) else cut
    }

    private data class Position(val section: Int, val offset: Int)

    private companion object {
        /** Минимальная ширина окна выдержки в долях книги (~полпроцента). */
        const val MIN_SPAN = 0.005

        /** На сколько окон режется заход, не влезший в потолок. */
        const val WINDOWS = 4

        /** Окно тоньше этого пересказывать нечем — тогда берём одну связную выдержку. */
        const val MIN_WINDOW = 300

        /** Явный разрыв между окнами: модель должна видеть пропуск, а не додумывать его. */
        const val GAP = "\n\n[…]\n\n"
    }
}

/**
 * Разбор EPUB в плоский текст (PRD §5.16) — второе место после [AnxShelfReader], где мы знаем
 * чужой формат, и такое же read-only.
 *
 * Разбираем регулярками, а не XML-парсером, по той же причине, что и фрагмент профиля GitHub:
 * нам нужны четыре вещи (корневой OPF, манифест, спайн, текст документов), а книги в дикой
 * природе бывают невалидны ровно настолько, чтобы строгий парсер отказался читать всё целиком.
 * Битый файл обязан стоить одного пропущенного пересказа, а не исключения в поллере.
 */
object EpubText {

    private val ROOTFILE = Regex("""<rootfile\b[^>]*\bfull-path="([^"]+)"""", RegexOption.IGNORE_CASE)
    private val ITEM = Regex("""<item\b[^>]*>""", RegexOption.IGNORE_CASE)
    private val ITEMREF = Regex("""<itemref\b[^>]*\bidref="([^"]+)"""", RegexOption.IGNORE_CASE)
    private val ID_ATTR = Regex("""\bid="([^"]+)"""")
    private val HREF_ATTR = Regex("""\bhref="([^"]+)"""")
    private val TITLE = Regex("""<title[^>]*>(.*?)</title>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    private val HEADING = Regex("""<h[1-3][^>]*>(.*?)</h[1-3]>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    private val DROPPED = Regex("""<(script|style)\b[^>]*>.*?</\1>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    private val TAG = Regex("""<[^>]*>""", RegexOption.DOT_MATCHES_ALL)
    private val BLOCK_TAG = Regex(
        """</?(p|div|br|li|tr|h[1-6]|section|article|blockquote|table|hr)\b[^>]*>""",
        RegexOption.IGNORE_CASE,
    )
    private val NUMERIC_ENTITY = Regex("""&#(x?)([0-9a-fA-F]+);""")
    private val SPACES = Regex("""[ \t ]+""")
    private val BLANK_LINES = Regex("""\n{2,}""")

    /** Книга по файлу; `null` — файла нет, это не zip или в нём не нашлось ни одного документа. */
    fun read(file: Path): EpubBook? {
        if (!Files.isRegularFile(file)) return null
        return try {
            ZipFile(file.toFile()).use { zip ->
                val opfPath = zip.text("META-INF/container.xml")
                    ?.let { ROOTFILE.find(it)?.groupValues?.get(1) }
                    ?: return null
                val opf = zip.text(opfPath) ?: return null
                val base = opfPath.substringBeforeLast('/', "")

                val hrefById = ITEM.findAll(opf).mapNotNull { item ->
                    val id = ID_ATTR.find(item.value)?.groupValues?.get(1) ?: return@mapNotNull null
                    val href = HREF_ATTR.find(item.value)?.groupValues?.get(1) ?: return@mapNotNull null
                    id to href
                }.toMap()

                val sections = ITEMREF.findAll(opf).mapNotNull { ref ->
                    val href = hrefById[ref.groupValues[1]] ?: return@mapNotNull null
                    val raw = zip.text(resolve(base, href)) ?: return@mapNotNull null
                    val text = plain(raw)
                    if (text.isBlank()) null else EpubSection(titleOf(raw), raw.length, text)
                }.toList()

                if (sections.isEmpty()) null else EpubBook(sections)
            }
        } catch (_: Exception) {
            // Не zip, оборванная загрузка, экзотическая раскладка — всё это значит одно:
            // пересказать нечем. Поллер попробует со следующей книгой.
            null
        }
    }

    /** Разметка в текст: блочные теги становятся переводом строки, остальные исчезают. */
    fun plain(html: String): String =
        html.replace(DROPPED, " ")
            .replace(BLOCK_TAG, "\n")
            .replace(TAG, "")
            .let(::entities)
            .replace(SPACES, " ")
            .lines().joinToString("\n") { it.trim() }
            .replace(BLANK_LINES, "\n")
            .trim()

    private fun titleOf(raw: String): String? =
        (TITLE.find(raw)?.groupValues?.get(1) ?: HEADING.find(raw)?.groupValues?.get(1))
            ?.let { plain(it) }
            ?.takeIf { it.isNotBlank() }

    /** Путь документа относительно каталога OPF; `%20` в именах реальных книг встречается часто. */
    private fun resolve(base: String, href: String): String {
        val clean = href.substringBefore('#').replace("%20", " ")
        val joined = if (base.isEmpty()) clean else "$base/$clean"
        // «../» в href уводит выше каталога OPF — сворачиваем вручную, путь идёт в zip, не в ФС.
        val parts = ArrayDeque<String>()
        joined.split('/').forEach {
            when (it) {
                "", "." -> Unit
                ".." -> parts.removeLastOrNull()
                else -> parts.addLast(it)
            }
        }
        return parts.joinToString("/")
    }

    private fun entities(text: String): String =
        NAMED.entries.fold(text) { acc, (name, value) -> acc.replace(name, value) }
            .replace(NUMERIC_ENTITY) { m ->
                val code = m.groupValues[2].toIntOrNull(if (m.groupValues[1].isEmpty()) 10 else 16)
                code?.takeIf { it in 1..0x10FFFF }?.let { String(Character.toChars(it)) } ?: m.value
            }

    private fun ZipFile.text(name: String): String? =
        getEntry(name)?.let { entry -> getInputStream(entry).use { it.readBytes().decodeToString() } }

    /** Сущности, которые реально встречаются в книгах; всё остальное закрывает числовая форма. */
    private val NAMED = mapOf(
        "&nbsp;" to " ", "&shy;" to "", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"",
        "&apos;" to "'", "&mdash;" to "—", "&ndash;" to "–", "&hellip;" to "…",
        "&laquo;" to "«", "&raquo;" to "»", "&ldquo;" to "“", "&rdquo;" to "”",
        "&lsquo;" to "‘", "&rsquo;" to "’", "&amp;" to "&",
    )
}
