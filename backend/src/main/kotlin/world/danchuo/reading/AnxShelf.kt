package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.isRegularFile

/**
 * The Anx Reader shelf on disk: where the WebDAV server puts what the phone sent, and how to
 * reach the database, covers and books. The layout is the reader's and we follow it. The
 * directory is mounted READ-ONLY — the WebDAV server is the only writer. PRD §5.16
 */
@ApplicationScoped
class AnxShelf(private val config: ReadingConfig) {

    /** Root of the reader's layout inside the volume; `null` when the shelf is unconfigured. */
    private fun root(): Path? =
        config.shelfDir()
            .filter { it.isNotBlank() }
            .map { Path.of(it).resolve(ANX_DIR) }
            .orElse(null)

    /** A shelf snapshot; `null` when unconfigured, the DB is missing, or it is mid-write. */
    fun snapshot(): ShelfSnapshot? {
        val database = root()?.let(AnxShelfReader::locateDatabase) ?: return null
        return AnxShelfReader.read(database)
    }

    /**
     * The cover file named by `cover_path` in the DB. That path came out of someone else's file,
     * so it is verified rather than trusted: the result must stay inside the covers directory, or
     * a `../../` in the DB would serve any file in the container.
     */
    fun coverFile(coverPath: String): Path? = dataFile(coverPath)

    /**
     * The book file named by `file_path` in the DB, the source of the text for summarising a
     * stretch of reading (PRD §5.16). Verified exactly as the cover is.
     */
    fun bookFile(filePath: String): Path? = dataFile(filePath)

    /** A file inside `anx/data`, and only inside: a `../../` in a foreign DB must lead nowhere. */
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
