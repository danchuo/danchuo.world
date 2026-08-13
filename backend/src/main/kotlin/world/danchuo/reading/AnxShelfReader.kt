package world.danchuo.reading

import org.jboss.logging.Logger
import org.sqlite.SQLiteDataSource
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.sql.Connection
import java.time.LocalDate
import kotlin.io.path.name

/** Книга полки: метаданные карточки и текущий прогресс (доля 0..1, как хранит Anx). */
data class ShelfBook(
    val id: Long,
    val title: String,
    val author: String?,
    val coverPath: String?,
    val percent: Double?,
)

/** Накопленные секунды чтения одной книги за один день — как их считает сама читалка. */
data class ShelfDayTotal(
    val bookId: Long,
    val date: LocalDate,
    val seconds: Int,
)

/** Полка на момент опроса: что за книги и сколько по ним прочитано по дням. */
data class ShelfSnapshot(
    val books: Map<Long, ShelfBook>,
    val dayTotals: List<ShelfDayTotal>,
)

/**
 * Разбор базы Anx Reader (PRD §5.16) — единственное место, где мы знаем чужую схему.
 *
 * **Почему вообще SQLite.** Читалка не отдаёт статистику ничем, кроме синка: по WebDAV уезжает
 * её база целиком (`anx/database<N>.db`). Публичного API у приложения нет — рассмотрено и
 * отклонено: eBoox (в котором владелец читал раньше) не отдаёт наружу ни процента, ни минут
 * вообще ничем, поэтому читалка и сменилась.
 *
 * **Файл читается через копию.** WebDAV-загрузка не атомарна: опрос легко застаёт базу
 * недописанной, а параллельное чтение из-под пишущего клиента — ещё и битые страницы. Копия
 * снимается за один `Files.copy`, дальше работаем с ней; не получилось — прогон возвращает
 * `null`, и следующий такт попробует снова.
 *
 * **Полка read-only.** Файл принадлежит телефону; наш том смонтирован `:ro`, и открываем мы
 * только копию. Испортить владельцу книги слайс не может физически.
 */
object AnxShelfReader {

    private val log: Logger = Logger.getLogger(AnxShelfReader::class.java)

    /** Имена вида `database7.db`: цифры между префиксом и расширением — версия схемы Anx. */
    private val DATABASE_NAME = Regex("""^database(\d+)\.db$""")

    /**
     * Самая свежая база в каталоге. Anx поднимает версию схемы и заливает базу под новым
     * именем, старую не убирая, — поэтому берём максимум по версии, а не первую попавшуюся.
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

    /** Снимок полки; `null` — файла нет либо он недочитан (это норма, а не поломка). */
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
            // Недописанный PUT, битая копия, сменившаяся схема — все они означают одно:
            // этого такта не было. Следующий разберётся; шуметь в лог на каждый опрос незачем.
            log.debugf("reading: полку прочитать не удалось (%s)", e.message)
            null
        } finally {
            copy?.let { runCatching { Files.deleteIfExists(it) } }
        }
    }

    /**
     * Соединение с копией базы. Драйвер берётся типом, а не через `DriverManager`: тот ищет его
     * ServiceLoader'ом по загрузчику вызывающего класса, а под Quarkus загрузчиков несколько —
     * и sqlite-драйвер для него «не найден» (ловилось в тестах). Типизированный datasource от
     * загрузчика не зависит и заодно спокойнее переживает native-образ.
     */
    private fun connect(database: Path): Connection =
        SQLiteDataSource().apply { url = "jdbc:sqlite:$database" }.connection

    /**
     * Книги полки. Без названия карточки нет — такие пропускаем; `is_deleted` у Anx мягкое,
     * и удалённые книги на борде не нужны.
     */
    private fun readBooks(connection: Connection): Map<Long, ShelfBook> {
        val books = LinkedHashMap<Long, ShelfBook>()
        connection.createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT id, title, author, cover_path, reading_percentage
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
                    )
                }
            }
        }
        return books
    }

    /**
     * Накопленные секунды по книге за день. У Anx это одна строка на книгу-день, но в старых
     * базах в `date` лежит полная метка времени — отсюда `substr` и свёртка суммой.
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
