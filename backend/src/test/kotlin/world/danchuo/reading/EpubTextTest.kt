package world.danchuo.reading

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * EPUB into flat text and the excerpt of what was read (PRD §5.16). The book arrives on the same
 * WebDAV shelf as the statistics, and the retelling can only be built from it. Text follows the
 * spine, markup is stripped but paragraph edges stay, and the slice is by document SIZE.
 */
class EpubTextTest {

    @TempDir
    lateinit var dir: Path

    @Test
    fun `sections come in spine order, not in archive order`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        assertEquals(listOf("Первая глава", "Вторая глава", "Третья глава"), book.sections.map { it.title })
    }

    @Test
    fun `markup is stripped but block boundaries survive`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        val first = book.sections.first().text
        assertFalse(first.contains("<"), "разметка должна быть снята: $first")
        assertFalse(first.contains("главаЖил"), "блоки слиплись: $first")
        assertTrue(first.contains("Жил"), "текст абзаца потерялся: $first")
        assertTrue(first.contains("«кит» & кот"), "сущности не раскрыты: $first")
    }

    @Test
    fun `the excerpt of a range lands inside that range`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // The second chapter is the whole middle of the book BY SIZE, so 0.4..0.6 must be about it.
        val excerpt = book.excerpt(from = 0.4, to = 0.6)

        assertTrue(excerpt.contains("вторая"), "середина книги — вторая глава: $excerpt")
        assertFalse(excerpt.contains("третья"), "конец книги в середину попасть не мог: $excerpt")
    }

    @Test
    fun `an excerpt never runs past the end of what was read`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // Catching the unread part would spoil the owner's own book for them.
        assertFalse(book.excerpt(from = 0.0, to = 0.6).contains("третья"))
    }

    @Test
    fun `an empty range still gives something to summarise`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // An imported day or a rounding miss gives from == to; an empty string would kill the
        // retelling for nothing, so a window around the point is taken.
        assertTrue(book.excerpt(from = 0.5, to = 0.5).isNotBlank())
    }

    @Test
    fun `a file that is not an epub is a quiet null`() {
        val notEpub = dir.resolve("notes.txt").also { Files.writeString(it, "просто текст") }

        assertNull(EpubText.read(notEpub))
        assertNull(EpubText.read(dir.resolve("missing.epub")))
    }

    /**
     * A minimal EPUB: container → OPF → three chapters of different sizes. The manifest order is
     * deliberately shuffled against the spine, which is how "we read the spine" is checked.
     */
    private fun epub(path: Path): Path {
        val chapters = listOf(
            "ch1.xhtml" to chapter("Первая глава", "Жил да был первая глава, и было в ней «кит» &amp; кот.", 3),
            "ch2.xhtml" to chapter("Вторая глава", "Здесь идёт вторая и самая длинная часть книги.", 40),
            "ch3.xhtml" to chapter("Третья глава", "И наконец третья, короткая.", 3),
        )
        ZipOutputStream(Files.newOutputStream(path)).use { zip ->
            zip.put("mimetype", "application/epub+zip")
            zip.put(
                "META-INF/container.xml",
                """
                <?xml version="1.0"?>
                <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                  <rootfiles><rootfile full-path="OEBPS/content.opf"
                    media-type="application/oebps-package+xml"/></rootfiles>
                </container>
                """.trimIndent(),
            )
            zip.put(
                "OEBPS/content.opf",
                """
                <?xml version="1.0"?>
                <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
                  <manifest>
                    <item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
                    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
                    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
                    <item id="css" href="style.css" media-type="text/css"/>
                  </manifest>
                  <spine>
                    <itemref idref="c1"/>
                    <itemref idref="c2"/>
                    <itemref idref="c3"/>
                  </spine>
                </package>
                """.trimIndent(),
            )
            zip.put("OEBPS/style.css", "body { margin: 0 }")
            chapters.forEach { (name, body) -> zip.put("OEBPS/$name", body) }
        }
        return path
    }

    private fun chapter(title: String, line: String, repeat: Int): String =
        buildString {
            append("<?xml version=\"1.0\"?>\n<html xmlns=\"http://www.w3.org/1999/xhtml\"><head>")
            append("<title>$title</title><style>p { color: red }</style></head><body>")
            append("<h1>$title</h1>")
            repeat(repeat) { append("<p>$line&#160;Строка ${it + 1}.</p>") }
            append("</body></html>")
        }

    private fun ZipOutputStream.put(name: String, content: String) {
        putNextEntry(ZipEntry(name))
        write(content.toByteArray())
        closeEntry()
    }
}
