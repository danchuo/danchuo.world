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
 * Разбор EPUB в плоский текст и вырезание прочитанного куска (PRD §5.16).
 *
 * Книга приезжает к нам той же полкой, что и статистика: Anx синкает по WebDAV и сам файл
 * (`anx/data/file/…epub`). Пересказывать кусок можно только по НЕМУ — иначе модели пришлось бы
 * сочинять по названию.
 *
 * Проверяем:
 * - **порядок чтения** — текст идёт по спайну, а не по алфавиту файлов в архиве;
 * - **разметка снята**, но границы абзацев остаются: слова соседних блоков не слипаются;
 * - **срез по долям** совпадает с тем, как долю считает читалка — по РАЗМЕРУ документов, а не
 *   по их числу (глава на 8 килобайт и глава на 800 байт занимают на шкале разное место);
 * - **не EPUB** — тихий `null`, как у всей полки: это норма, а не поломка.
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
        // Заголовок и первый абзац — разные блоки, между ними обязан остаться разрыв.
        assertFalse(first.contains("главаЖил"), "блоки слиплись: $first")
        assertTrue(first.contains("Жил"), "текст абзаца потерялся: $first")
        // Сущности раскрыты, неразрывный пробел стал обычным.
        assertTrue(first.contains("«кит» & кот"), "сущности не раскрыты: $first")
    }

    @Test
    fun `the excerpt of a range lands inside that range`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // Вторая глава — вся середина книги по размеру; кусок 0.4..0.6 обязан быть про неё.
        val excerpt = book.excerpt(from = 0.4, to = 0.6)

        assertTrue(excerpt.contains("вторая"), "середина книги — вторая глава: $excerpt")
        assertFalse(excerpt.contains("третья"), "конец книги в середину попасть не мог: $excerpt")
    }

    @Test
    fun `an excerpt never runs past the end of what was read`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // Последняя глава начинается там же, где кончается вторая: кусок «до 60%» её не задевает.
        // Захватить непрочитанное значило бы спойлерить владельцу его же книгу.
        assertFalse(book.excerpt(from = 0.0, to = 0.6).contains("третья"))
    }

    @Test
    fun `an empty range still gives something to summarise`() {
        val book = EpubText.read(epub(dir.resolve("book.epub")))!!

        // Импортированный день и промах округления дают from == to; пустая строка сорвала бы
        // пересказ на ровном месте — берём окно вокруг точки.
        assertTrue(book.excerpt(from = 0.5, to = 0.5).isNotBlank())
    }

    @Test
    fun `a file that is not an epub is a quiet null`() {
        val notEpub = dir.resolve("notes.txt").also { Files.writeString(it, "просто текст") }

        assertNull(EpubText.read(notEpub))
        assertNull(EpubText.read(dir.resolve("missing.epub")))
    }

    /**
     * Минимальный EPUB: контейнер → OPF → три главы разного размера. Порядок в манифесте
     * намеренно перепутан относительно спайна — так проверяется, что читаем мы спайн.
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
