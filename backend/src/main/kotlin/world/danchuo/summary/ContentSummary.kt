package world.danchuo.summary

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
enum class SummaryStatus {
    /** Есть что показать: пункты (и, если модель осилила, строка-итог). */
    READY,

    /**
     * Попробовали и не смогли: источника нет, текст не разобрался, модель промолчала. Строка
     * живёт ради счётчика попыток — фоновый счёт не должен биться в стену вечно.
     */
    FAILED,
    ;

    fun code(): String = name.lowercase()
}

/**
 * Пересказ куска, пройденного за один заход (PRD §5.16). Одна строка на заход — ключ составной:
 * [kind] + [sessionId].
 *
 * Делается **только по тексту самого источника**. Пересказ «по памяти модели» рассмотрен и
 * отклонён: на публичном борде он однажды уверенно соврал бы про книгу, которой модель не знает,
 * и отличить это на странице было бы нечем. Отсюда же правило «нет источника — нет кнопки».
 *
 * Она же — память фонового счёта о собственных промахах: недоступная модель или пропавший с
 * полки файл оставляют `failed` с засчитанной попыткой, и очередь идёт дальше, вместо того чтобы
 * выжигать бесплатный лимит на одном и том же заходе.
 */
@Entity
@Table(name = "content_summary")
class ContentSummary {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Вид заходa ([SummaryKind]); вместе с [sessionId] образует ключ строки. */
    @Column(nullable = false, length = 16)
    var kind: String = SummaryKind.READING.code()

    @Column(name = "session_id", nullable = false)
    var sessionId: Long = 0

    @Column(nullable = false, length = 16)
    var status: String = SummaryStatus.FAILED.code()

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
     * Какой кусок покрывает лежащий здесь текст, в долях 0..1. `null` — покрывать нечем (успеха
     * ещё не было). Заход не застывает в момент первого пересказа: вернулся в пределах паузы —
     * поллер продлевает ТУ ЖЕ строку сессии, и пересказ её начала перестаёт отвечать за неё
     * целиком. По этой паре очередь и понимает, что пора освежить.
     */
    @Column(name = "covered_start")
    var coveredStart: Double? = null

    @Column(name = "covered_end")
    var coveredEnd: Double? = null

    /**
     * Конец куска, на который целилась ПОСЛЕДНЯЯ попытка. Заход, доросший ещё дальше, — это
     * новая цель, и счётчик промахов по ней начинается заново: решение «сдаюсь» было принято
     * про другой кусок.
     */
    @Column(name = "target_end")
    var targetEnd: Double? = null

    @Column(nullable = false)
    var attempts: Int = 0

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant

    /** Готов ли пересказ к показу: статус `ready` и хотя бы один пункт. */
    fun isReady(): Boolean =
        status == SummaryStatus.READY.code() && !bullets.isNullOrBlank()

    /** Пункты списком — хранятся строками, наружу идут массивом. */
    fun bulletLines(): List<String> =
        bullets?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

    /** Снимок для правил очереди ([SummaryPolicy]) — без сущности и без базы. */
    fun state(): SummaryState = SummaryState(
        ready = isReady(),
        coveredEnd = coveredEnd,
        targetEnd = targetEnd,
        attempts = attempts,
    )
}

/** Доступ к пересказам: чтение — по виду и заходу, запись — только из [SummaryService]. */
@ApplicationScoped
class ContentSummaryRepository : PanacheRepository<ContentSummary> {

    fun findBy(kind: SummaryKind, sessionId: Long): ContentSummary? =
        find("kind = ?1 and sessionId = ?2", kind.code(), sessionId).firstResult()

    /** Пересказы пачки заходов одного вида — проекция дня спрашивает про все карточки разом. */
    fun listBy(kind: SummaryKind, sessionIds: Collection<Long>): List<ContentSummary> =
        if (sessionIds.isEmpty()) emptyList()
        else list("kind = ?1 and sessionId in ?2", kind.code(), sessionIds)

    /** Всё, что очередь уже трогала в этом виде: и готовое, и промахнувшееся со счётчиком. */
    fun bySession(kind: SummaryKind): Map<Long, ContentSummary> =
        list("kind", kind.code()).associateBy { it.sessionId }
}
