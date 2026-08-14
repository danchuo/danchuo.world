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

/** Чем кончилась попытка пересказать кусок. */
enum class ReadingSummaryStatus {
    /** Есть что показать: пункты (и, если модель осилила, строка-итог). */
    READY,

    /**
     * Попробовали и не смогли: книги нет на полке, файл не разобрался, модель промолчала.
     * Строка живёт ради счётчика попыток — фоновый счёт не должен биться в стену вечно.
     */
    FAILED,
    ;

    fun code(): String = name.lowercase()
}

/**
 * Пересказ куска книги, пройденного за один заход (PRD §5.16).
 *
 * Делается **только по тексту самой книги**: читалка синкает epub вместе со своей базой, а
 * проценты сессии говорят, какой кусок вырезать. Пересказ «по памяти модели» рассмотрен и
 * отклонён — на публичном борде он однажды уверенно соврал бы про книгу, которой модель не
 * знает, и отличить это на странице было бы нечем.
 *
 * Одна строка на сессию. Она же — память фонового счёта о собственных промахах: недоступная
 * модель или отсутствующая на полке книга оставляют `failed` с засчитанной попыткой, и очередь
 * идёт дальше, вместо того чтобы выжигать бесплатный лимит на одной и той же сессии.
 */
@Entity
@Table(name = "reading_summary")
class ReadingSummary {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "session_id", nullable = false, unique = true)
    var sessionId: Long = 0

    @Column(nullable = false, length = 16)
    var status: String = ReadingSummaryStatus.FAILED.code()

    /** Пункты пересказа — по одному на строку; пусто у неудачной попытки. */
    @Column(columnDefinition = "TEXT")
    var bullets: String? = null

    /** Строка-итог про весь кусок; `null` — модель её не дала, и это не повод терять пункты. */
    @Column(columnDefinition = "TEXT")
    var takeaway: String? = null

    /** Кто отвечал: бесплатную полосу можно перенастроить, а строка должна помнить автора. */
    @Column(length = 96)
    var model: String? = null

    /**
     * Какой кусок книги покрывает лежащий здесь текст. `null` — покрывать нечем (успеха ещё
     * не было). Заход не застывает в момент первого пересказа: вернулся к книге в пределах
     * паузы — поллер продлевает ТУ ЖЕ строку, и пересказ начала перестаёт отвечать за неё
     * целиком. По этой паре очередь и понимает, что пора освежить.
     */
    @Column(name = "covered_start_percent")
    var coveredStartPercent: Double? = null

    @Column(name = "covered_end_percent")
    var coveredEndPercent: Double? = null

    /**
     * Конец куска, на который целилась ПОСЛЕДНЯЯ попытка. Заход, доросший ещё дальше, — это
     * новая цель, и счётчик промахов по ней начинается заново: решение «сдаюсь» было принято
     * про другой кусок.
     */
    @Column(name = "target_end_percent")
    var targetEndPercent: Double? = null

    @Column(nullable = false)
    var attempts: Int = 0

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant

    /** Готов ли пересказ к показу: статус `ready` и хотя бы один пункт. */
    fun isReady(): Boolean =
        status == ReadingSummaryStatus.READY.code() && !bullets.isNullOrBlank()


    /** Пункты списком — хранятся строками, наружу идут массивом. */
    fun bulletLines(): List<String> =
        bullets?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
}

/** Доступ к пересказам: чтение — по сессии, запись — только из [ReadingSummaryService]. */
@ApplicationScoped
class ReadingSummaryRepository : PanacheRepository<ReadingSummary> {

    fun findBySession(sessionId: Long): ReadingSummary? = find("sessionId", sessionId).firstResult()

    /** Пересказы пачки сессий — проекция дня спрашивает про все карточки разом. */
    fun listBySessions(sessionIds: Collection<Long>): List<ReadingSummary> =
        if (sessionIds.isEmpty()) emptyList() else list("sessionId in ?1", sessionIds)

    /** Всё, что очередь уже трогала, по сессиям: и готовое, и промахнувшееся со счётчиком. */
    fun bySession(): Map<Long, ReadingSummary> = listAll().associateBy { it.sessionId }
}
