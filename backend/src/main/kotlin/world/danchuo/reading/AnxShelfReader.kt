package world.danchuo.reading

import org.jboss.logging.Logger
import org.sqlite.SQLiteDataSource
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.sql.Connection
import java.time.LocalDate
import kotlin.io.path.name

/** A shelf book: card metadata plus current progress (a 0..1 fraction, as Anx stores it). */
data class ShelfBook(
    val id: Long,
    val title: String,
    val author: String?,
    val coverPath: String?,
    val percent: Double?,
    /**
     * The book file's path inside the shelf. The reader syncs the epub along with the DB, and this
     * is where the text for summarising a stretch comes from ([EpubText], PRD §5.16).
     */
    val filePath: String? = null,
)

/** Accumulated reading seconds for one book on one day — as the reader itself counts them. */
data class ShelfDayTotal(
    val bookId: Long,
    val date: LocalDate,
    val seconds: Int,
)

/** The shelf at poll time: which books, and how much was read per day. */
data class ShelfSnapshot(
    val books: Map<Long, ShelfBook>,
    val dayTotals: List<ShelfDayTotal>,
)

/**
 * Parsing of the Anx Reader database — the one place where we know someone else's schema. The
 * file is read THROUGH A COPY, because a WebDAV upload is not atomic and a poll easily catches
 * the database half-written; a failed copy returns `null` and the next tick retries. PRD §5.16
 */
object AnxShelfReader {

    private val log: Logger = Logger.getLogger(AnxShelfReader::class.java)

    /** Names like `database7.db`: the digits between prefix and extension are the Anx schema version. */
    private val DATABASE_NAME = Regex("""^database(\d+)\.db$""")

    /**
     * The newest DB in the directory. Anx bumps the schema version and uploads the DB under a new
     * name without removing the old, so take the highest version rather than the first found.
     */
    fun locateDatabase(dir: Path): Path? {
        if (!Files.isDirectory(dir)) return null
        return Files.list(dir).use { paths ->
            paths.toList()
                .mapNotNull { path -> DATABASE_NAME.find(path.name)?.let { it.groupValues[1].toInt() to path } }
                .maxByOrNull { it.first }
                ?.second
        }
    }

    /** A shelf snapshot; `null` when the file is missing or mid-write, which is normal. */
    fun read(database: Path): ShelfSnapshot? {
        if (!Files.isRegularFile(database)) return null

        var copy: Path? = null
        return try {
            copy = Files.createTempFile("anx-shelf", ".db").also {
                Files.copy(database, it, StandardCopyOption.REPLACE_EXISTING)
            }
            connect(copy).use { connection ->
                ShelfSnapshot(books = readBooks(connection), dayTotals = readDayTotals(connection))
            }
        } catch (e: Exception) {
            // An unfinished PUT, a torn copy, a changed schema — all mean the same: this tick did
            // not happen. The next one will sort it out; no need to log on every poll.
            log.debugf("reading: полку прочитать не удалось (%s)", e.message)
            null
        } finally {
            copy?.let { runCatching { Files.deleteIfExists(it) } }
        }
    }

    /**
     * Connects to the database copy. The driver is taken BY TYPE, not via `DriverManager`, which
     * looks it up with a ServiceLoader on the calling class's loader — under Quarkus there are
     * several, and the sqlite driver came back "not found". A typed datasource does not care.
     */
    private fun connect(database: Path): Connection =
        SQLiteDataSource().apply { url = "jdbc:sqlite:$database" }.connection

    /**
     * The shelf's books. Without a title there is no card, so those are skipped; `is_deleted` in
     * Anx is soft, and deleted books have no place on the board.
     */
    private fun readBooks(connection: Connection): Map<Long, ShelfBook> {
        val books = LinkedHashMap<Long, ShelfBook>()
        connection.createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT id, title, author, cover_path, file_path, reading_percentage
                FROM tb_books
                WHERE COALESCE(is_deleted, 0) = 0
                """.trimIndent(),
            ).use { rows ->
                while (rows.next()) {
                    val title = rows.getString("title")?.takeIf { it.isNotBlank() } ?: continue
                    val id = rows.getLong("id")
                    books[id] = ShelfBook(
                        id = id,
                        title = title,
                        author = rows.getString("author")?.takeIf { it.isNotBlank() },
                        coverPath = rows.getString("cover_path")?.takeIf { it.isNotBlank() },
                        percent = rows.getDouble("reading_percentage").takeUnless { rows.wasNull() },
                        filePath = rows.getString("file_path")?.takeIf { it.isNotBlank() },
                    )
                }
            }
        }
        return books
    }

    /**
     * Accumulated seconds per book per day. In Anx that is one row per book-day, but older DBs
     * keep a full timestamp in `date` — hence the `substr` and the sum.
     */
    private fun readDayTotals(connection: Connection): List<ShelfDayTotal> {
        val totals = ArrayList<ShelfDayTotal>()
        connection.createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT book_id, substr(date, 1, 10) AS day, SUM(reading_time) AS seconds
                FROM tb_reading_time
                WHERE book_id IS NOT NULL AND date IS NOT NULL
                GROUP BY book_id, day
                """.trimIndent(),
            ).use { rows ->
                while (rows.next()) {
                    val day = runCatching { LocalDate.parse(rows.getString("day")) }.getOrNull() ?: continue
                    totals += ShelfDayTotal(
                        bookId = rows.getLong("book_id"),
                        date = day,
                        seconds = rows.getInt("seconds"),
                    )
                }
            }
        }
        return totals
    }
}
