package world.danchuo.reading

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/** Откуда взялась строка: наблюдали живьём или забрали уже закрытым днём. */
enum class ReadingSource {
    /** Поллер видел, как счётчик рос: есть время на часах и путь по процентам. */
    LIVE,

    /**
     * День приехал уже прошедшим (первый запуск либо телефон синкнулся с опозданием). Минуты
     * известны, остальное — нет: сочинять для него проценты значило бы выдумывать историю.
     */
    IMPORTED,
    ;

    fun code(): String = name.lowercase()
}

/**
 * Кусок чтения одной книги (PRD §5.16). Одна строка — один непрерывный заход; книга, взятая
 * утром и вечером, даёт ДВЕ строки за одну дату.
 *
 * Минуты здесь — читалкины (мы берём приросты её счётчика), а границы сессии и проценты —
 * наши: внутри дня читалка не хранит ни времени, ни истории прогресса (см. [ReadingSessionMath]).
 *
 * Метаданные книги денормализованы намеренно: борд показывает историю, а книгу с полки могут
 * убрать — резолвить её заново на чтении значило бы переписывать прошлое пустотой.
 */
@Entity
@Table(name = "reading_session")
class ReadingSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Дата MSK, которой принадлежит чтение; сессия не пересекает полночь. */
    @Column(nullable = false)
    lateinit var date: LocalDate

    /** Идентификатор книги внутри базы читалки — живёт ровно столько, сколько сама полка. */
    @Column(name = "book_id", nullable = false)
    var bookId: Long = 0

    @Column(name = "book_title", nullable = false, length = 512)
    lateinit var bookTitle: String

    @Column(name = "book_author", length = 256)
    var bookAuthor: String? = null

    /** Путь обложки внутри полки («cover/имя.png»); наружу отдаётся через [ReadingResource]. */
    @Column(name = "cover_path", length = 512)
    var coverPath: String? = null

    /**
     * Путь файла книги внутри полки («file/книга.epub») — по нему берётся текст для пересказа
     * куска ([ReadingSummary]). Денормализован по той же причине, что название и обложка: книгу
     * с полки могут убрать, а рассказанное про прошлый заход должно остаться.
     */
    @Column(name = "book_file_path", length = 512)
    var bookFilePath: String? = null

    /** Зачтённые секунды — приросты счётчика читалки, а не разница часов. */
    @Column(name = "read_seconds", nullable = false)
    var readSeconds: Int = 0

    /** Доля 0..1, как хранит читалка. `null` — начало захода неизвестно (первый или импорт). */
    @Column(name = "start_percent")
    var startPercent: Double? = null

    @Column(name = "end_percent")
    var endPercent: Double? = null

    /** Время наших наблюдений; на импортированных днях пусто — тогда мы не смотрели. */
    @Column(name = "started_at")
    var startedAt: Instant? = null

    @Column(name = "ended_at")
    var endedAt: Instant? = null

    @Column(nullable = false, length = 16)
    var source: String = ReadingSource.LIVE.code()
}

/**
 * Доступ к сессиям чтения. Чтение — по дате и диапазону (карточки дня и календарь), запись —
 * только из [ReadingService].
 */
@ApplicationScoped
class ReadingSessionRepository : PanacheRepository<ReadingSession> {

    fun listByDate(date: LocalDate): List<ReadingSession> = list("date", date)

    /** Сессии диапазона `[from, to]` включительно — для пакетного чтения календаря. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<ReadingSession> =
        list("date >= ?1 and date <= ?2", from, to)

    /** Строки одной книги за дату — по ним считается уже учтённое (состояние поллера). */
    fun listByBookAndDate(bookId: Long, date: LocalDate): List<ReadingSession> =
        list("bookId = ?1 and date = ?2", bookId, date)

    /**
     * Последняя по времени сессия книги за дату — кандидат на продолжение. Тянуть её или
     * открывать новую, решает [ReadingSessionMath.continues] по паузе.
     */
    fun latestOn(bookId: Long, date: LocalDate): ReadingSession? =
        find("bookId = ?1 and date = ?2 order by endedAt desc nulls last, id desc", bookId, date).firstResult()

    /**
     * Заходы, из которых МОЖНО вырезать кусок книги: известен файл на полке и оба конца пути по
     * процентам (PRD §5.16). Свежие впереди — борд смотрят с сегодняшнего дня, и вчерашний вечер
     * нужен раньше мартовского.
     */
    fun summarisable(): List<ReadingSession> = list(
        "bookFilePath is not null and startPercent is not null and endPercent is not null " +
            "and endPercent > startPercent order by date desc, id desc",
    )

    /**
     * Дописать путь к файлу книги там, где его ещё нет.
     *
     * Метаданные заходов освежаются, только когда приросли минуты, — а путь к файлу мы стали
     * забирать позже самих заходов, и без этого у всей прошлой истории он остался бы пустым
     * навсегда (пересказ ей не светил бы, пока владелец не откроет книгу снова). Это не
     * переписывание прошлого: заполняем ТОЛЬКО пустое, уже записанный путь не трогаем — книга,
     * снятая с полки, должна сохранить тот, по которому её ещё можно найти.
     */
    fun fillMissingFilePath(bookId: Long, filePath: String): Int =
        update("bookFilePath = ?1 where bookId = ?2 and bookFilePath is null", filePath, bookId)

    /**
     * Последний известный процент книги — «откуда» для нового захода. Берём по любой дате:
     * вчерашняя остановка на 35% и есть начало сегодняшнего чтения.
     */
    fun lastKnownPercent(bookId: Long): Double? =
        find("bookId = ?1 and endPercent is not null order by date desc, endedAt desc nulls last, id desc", bookId)
            .firstResult()
            ?.endPercent
}
