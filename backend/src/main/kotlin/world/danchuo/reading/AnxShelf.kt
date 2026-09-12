package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.isRegularFile

/**
 * Полка Anx Reader на диске (PRD §5.16): куда WebDAV-сервер кладёт присланное телефоном и как
 * оттуда достать базу, обложки и сами книги. Раскладку задаёт читалка, мы под неё подстраиваемся:
 *
 * ```
 * <shelf-dir>/anx/database<N>.db      — вся статистика чтения
 * <shelf-dir>/anx/data/cover/имя.png  — обложки (cover_path в базе хранится как "cover/имя.png")
 * <shelf-dir>/anx/data/file/книга.epub — сами книги; нам они не нужны
 * ```
 *
 * Каталог смонтирован read-only: слайс — читатель полки, единственный канал записи в неё —
 * сам WebDAV-сервер.
 */
@ApplicationScoped
class AnxShelf(private val config: ReadingConfig) {

    /** Корень раскладки читалки внутри тома; `null` — полка не сконфигурирована. */
    private fun root(): Path? =
        config.shelfDir()
            .filter { it.isNotBlank() }
            .map { Path.of(it).resolve(ANX_DIR) }
            .orElse(null)

    /** Снимок полки; `null` — не сконфигурировано, базы нет либо она недочитана. */
    fun snapshot(): ShelfSnapshot? {
        val database = root()?.let(AnxShelfReader::locateDatabase) ?: return null
        return AnxShelfReader.read(database)
    }

    /**
     * Файл обложки по `cover_path` из базы. Путь пришёл из чужого файла, поэтому он проверяется,
     * а не склеивается на веру: результат обязан остаться внутри каталога обложек — иначе
     * `../../` в базе увёл бы отдачу в любой файл контейнера.
     */
    fun coverFile(coverPath: String): Path? = dataFile(coverPath)

    /**
     * Файл книги по `file_path` из базы («file/книга.epub») — из него берётся текст для
     * пересказа прочитанного куска (PRD §5.16). Проверка та же, что у обложки.
     */
    fun bookFile(filePath: String): Path? = dataFile(filePath)

    /** Файл внутри `anx/data`, и только внутри: `../../` в чужой базе не должен никуда уводить. */
    private fun dataFile(relative: String): Path? {
        val data = root()?.resolve(DATA_DIR)?.normalize() ?: return null
        val resolved = data.resolve(relative).normalize()
        if (!resolved.startsWith(data)) return null
        return resolved.takeIf { it.isRegularFile() }
    }

    private companion object {
        const val ANX_DIR = "anx"
        const val DATA_DIR = "data"
    }
}
