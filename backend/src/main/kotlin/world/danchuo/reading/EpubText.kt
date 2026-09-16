package world.danchuo.reading

import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile

/** A spine document: how much it weighs in the source, and what it says in words. */
data class EpubSection(
    /** Document title (`<title>`, else the first `<h1>`); `null` when unnamed. */
    val title: String?,
    /**
     * Length of the document SOURCE in characters, markup included. Not curiosity but a scale: the
     * reader computes the read fraction by document weight, not by chapter count, and the excerpt
     * must use the same ruler (see [EpubBook.excerpt]).
     */
    val rawChars: Int,
    /** Text without markup: paragraphs separated by a newline. */
    val text: String,
)

/**
 * A book parsed into flat text: spine documents in reading order. The source text exists for one
 * reason — a summary of the passage read is made ONLY from it. Summarising "from the model's
 * memory" was considered and rejected: PRD §5.16.
 */
class EpubBook(val sections: List<EpubSection>) {

    private val totalRaw: Int = sections.sumOf { it.rawChars }.coerceAtLeast(1)

    /** Titles of the documents falling inside `[from, to]` — context for the prompt. */
    fun titlesIn(from: Double, to: Double): List<String> {
        val first = locate(from).section
        val last = locate(to).section
        return sections.subList(first, (last + 1).coerceAtMost(sections.size))
            .mapNotNull { it.title?.takeIf { t -> t.isNotBlank() } }
            .distinct()
    }

    /**
     * Text between fractions [from] and [to] — the passage covered in one sitting. Fractions land
     * on the WEIGHT scale of spine documents, and the boundaries are never widened forward. Both
     * rules, and why the miss is absorbed backwards instead: PRD §5.16.
     */
    fun excerpt(from: Double, to: Double): String {
        val end = to.coerceIn(0.0, 1.0)
        // An empty (or inverted) range is no reason to go without a summary: a window back from
        // the stopping point answers the same "what was this" question.
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
        return text
    }

    /** Fraction to a place in the book: which document, and how many characters from its start. */
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

    private data class Position(val section: Int, val offset: Int)

    private companion object {
        /** Minimum excerpt window width as a fraction of the book (about half a percent). */
        const val MIN_SPAN = 0.005
    }
}

/**
 * Parses EPUB into flat text with regexes rather than an XML parser, for the same reason as the
 * GitHub profile fragment: we need four things, and books in the wild are invalid just enough that
 * a strict parser refuses the whole file. A broken book costs one skipped summary. PRD §5.16
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

    /** A book from a file; `null` when the file is missing, is not a zip, or holds no documents. */
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
            // Not a zip, a torn download, an exotic layout — all mean the same: nothing to
            // summarise from. The poller will try the next book.
            null
        }
    }

    /** Markup to text: block tags become newlines, the rest disappear. */
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

    /** Document path relative to the OPF directory; `%20` is common in real book file names. */
    private fun resolve(base: String, href: String): String {
        val clean = href.substringBefore('#').replace("%20", " ")
        val joined = if (base.isEmpty()) clean else "$base/$clean"
        // A "../" in an href leads above the OPF directory — fold it by hand; the path goes into
        // the zip, not the filesystem.
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

    /** Entities that actually occur in books; the numeric form covers everything else. */
    private val NAMED = mapOf(
        "&nbsp;" to " ", "&shy;" to "", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"",
        "&apos;" to "'", "&mdash;" to "—", "&ndash;" to "–", "&hellip;" to "…",
        "&laquo;" to "«", "&raquo;" to "»", "&ldquo;" to "“", "&rdquo;" to "”",
        "&lsquo;" to "‘", "&rsquo;" to "’", "&amp;" to "&",
    )
}
