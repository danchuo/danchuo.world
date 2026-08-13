package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.isRegularFile

/**
 * Полка Anx Reader на диске (PRD §5.16): куда WebDAV-сервер кладёт присланное телефоном и как
 * оттуда достать базу и обложки. Раскладку задаёт читалка, мы под неё подстраиваемся:
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
    fun coverFile(coverPath: String): Path? {
        val data = root()?.resolve(DATA_DIR)?.normalize() ?: return null
        val resolved = data.resolve(coverPath).normalize()
        if (!resolved.startsWith(data)) return null
        return resolved.takeIf { it.isRegularFile() }
    }

    /** Есть ли вообще что читать: для лампы свежести и для «не сконфигурировано» на борде. */
    fun isReadable(): Boolean = root()?.let { Files.isDirectory(it) } == true

    private companion object {
        const val ANX_DIR = "anx"
        const val DATA_DIR = "data"
    }
}
