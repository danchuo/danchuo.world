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

/** How an attempt to summarise a stretch ended. */
enum class SummaryStatus {
    /** There is something to show: the points, and a closing line if the model managed one. */
    READY,

    /**
     * Tried and failed: no source, the text would not parse, the model stayed silent. The row
     * exists for the attempt counter — background work must not beat against a wall forever.
     */
    FAILED,
    ;

    fun code(): String = name.lowercase()
}

/**
 * The summary of a passage covered in one sitting, one row per sitting, keyed by [kind] plus
 * [sessionId]. It is also the background counter's memory of its own failures: an unreachable
 * model leaves `failed` with an attempt spent, so the queue moves on. PRD §5.16
 */
@Entity
@Table(name = "content_summary")
class ContentSummary {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** The sitting's kind ([SummaryKind]); together with [sessionId] it forms the row key. */
    @Column(nullable = false, length = 16)
    var kind: String = SummaryKind.READING.code()

    @Column(name = "session_id", nullable = false)
    var sessionId: Long = 0

    @Column(nullable = false, length = 16)
    var status: String = SummaryStatus.FAILED.code()

    /** Summary points, one per line; empty after a failed attempt. */
    @Column(columnDefinition = "TEXT")
    var bullets: String? = null

    /** A closing line about the whole stretch; `null` when the model gave none, which is no reason to lose the points. */
    @Column(columnDefinition = "TEXT")
    var takeaway: String? = null

    /** Who answered: the free lane can be reconfigured, and the row must remember its author. */
    @Column(length = 96)
    var model: String? = null

    /**
     * Which slice the stored text covers, in fractions 0..1; `null` means there has been no
     * success yet. A sitting does not freeze when first summarised — returning within the pause
     * extends THAT SAME session row, and this pair is how the queue knows to refresh. PRD §5.16
     */
    @Column(name = "covered_start")
    var coveredStart: Double? = null

    @Column(name = "covered_end")
    var coveredEnd: Double? = null

    /**
     * The end of the stretch the LAST attempt aimed at. A sitting that grew further is a new
     * target, and the miss counter for it starts over: the decision to give up was made about a
     * different stretch.
     */
    @Column(name = "target_end")
    var targetEnd: Double? = null

    @Column(nullable = false)
    var attempts: Int = 0

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant

    /** Whether the summary is ready to show: status `ready` and at least one point. */
    fun isReady(): Boolean =
        status == SummaryStatus.READY.code() && !bullets.isNullOrBlank()

    /** The points as a list — stored as lines, served as an array. */
    fun bulletLines(): List<String> =
        bullets?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

    /** A snapshot for the queue rules ([SummaryPolicy]) — without the entity and without the DB. */
    fun state(): SummaryState = SummaryState(
        ready = isReady(),
        coveredEnd = coveredEnd,
        targetEnd = targetEnd,
        attempts = attempts,
    )
}

/** Access to summaries: reads by kind and sitting, writes only from [SummaryService]. */
@ApplicationScoped
class ContentSummaryRepository : PanacheRepository<ContentSummary> {

    fun findBy(kind: SummaryKind, sessionId: Long): ContentSummary? =
        find("kind = ?1 and sessionId = ?2", kind.code(), sessionId).firstResult()

    /** Summaries for a batch of sittings of one kind — the day projection asks for all cards at once. */
    fun listBy(kind: SummaryKind, sessionIds: Collection<Long>): List<ContentSummary> =
        if (sessionIds.isEmpty()) emptyList()
        else list("kind = ?1 and sessionId in ?2", kind.code(), sessionIds)

    /** Everything the queue has already touched in this kind: both ready and missed, with counters. */
    fun bySession(kind: SummaryKind): Map<Long, ContentSummary> =
        list("kind", kind.code()).associateBy { it.sessionId }
}
