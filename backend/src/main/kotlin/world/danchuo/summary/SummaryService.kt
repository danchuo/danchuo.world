package world.danchuo.summary

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Instance
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmLane
import java.time.Instant

/**
 * Summarising a passage: pick a sitting, take its text FROM THE SOURCE and only from there, ask
 * the model, store the result. No text means no summary and no button — an empty space is honester
 * than a confident invention. It runs on the free lane, so showcase calls are untouched. §5.16
 */
@ApplicationScoped
class SummaryService(
    private val sources: Instance<SummarySource>,
    private val summaries: ContentSummaryRepository,
    private val llm: LlmClient,
    private val config: SummaryConfig,
) {

    private val log: Logger = Logger.getLogger(SummaryService::class.java)

    /** Configured sources in a stable order — the poller walks them in a circle. */
    fun sources(): List<SummarySource> = sources.filter { it.isConfigured() }.sortedBy { it.kind().ordinal }

    /**
     * The source's next sitting — the freshest of those still needing a summary. The order is the
     * source's own ([SummarySource.candidates]); here we only filter by what has already been
     * told ([SummaryPolicy]).
     */
    @Transactional
    fun nextTarget(source: SummarySource): SummaryTarget? {
        val known = summaries.bySession(source.kind())
        return source.candidates().firstOrNull {
            SummaryPolicy.queued(
                end = it.to,
                known = known[it.sessionId]?.state(),
                refresh = config.refreshFraction(),
                maxAttempts = config.maxAttempts(),
            )
        }
    }

    /**
     * Fetches a summary for a stretch. `null` means there is nothing to tell: the source gave no
     * text, or the model stayed silent or refused. There is deliberately no transaction here —
     * inside are external calls that take seconds (file, network, model).
     */
    fun retell(source: SummarySource, target: SummaryTarget): Retelling? {
        val excerpt = source.excerpt(target) ?: run {
            log.debugf("summary: текста нет (%s #%d)", target.kind.code(), target.sessionId)
            return null
        }
        if (excerpt.text.isBlank()) return null

        val capped = excerpt.copy(text = SummaryWindows.cap(excerpt.text, config.maxChars()))
        return SummaryPrompt.parse(
            llm.completeText(
                SummaryPrompt.system(target.kind),
                SummaryPrompt.user(target, capped),
                LlmLane.FREE,
            ),
        )
    }

    /**
     * Stores the outcome of an attempt; a `null` retelling is a miss, and the row is still written
     * because it IS the queue's memory of attempts. A MISS NEVER ERASES WHAT WAS ALREADY TOLD —
     * the old text covers a smaller passage but is true. `true` if the board gained something.
     */
    @Transactional
    fun store(target: SummaryTarget, retelling: Retelling?, model: String): Boolean {
        val row = summaries.findBy(target.kind, target.sessionId) ?: ContentSummary().apply {
            kind = target.kind.code()
            sessionId = target.sessionId
            // IDENTITY generation writes the row immediately, so not-null fields are set BEFORE persist.
            updatedAt = Instant.now()
            summaries.persist(this)
        }

        // Misses are counted per TARGET: once it changes, the count starts over (see SummaryPolicy).
        row.attempts = SummaryPolicy.attemptsAfter(row.state(), target.to, config.refreshFraction())
        row.targetEnd = target.to
        row.updatedAt = Instant.now()

        if (retelling == null) {
            // What was already told survives a failed refresh: status and text both stay.
            if (!row.isReady()) row.status = SummaryStatus.FAILED.code()
            return false
        }
        row.model = model
        row.status = SummaryStatus.READY.code()
        row.bullets = retelling.bullets.joinToString("\n")
        row.takeaway = retelling.takeaway
        row.coveredStart = target.from
        row.coveredEnd = target.to
        row.attempts = 0
        return true
    }


    /** A ready summary for a sitting; `null` if there is none or it failed. */
    fun readyFor(kind: SummaryKind, sessionId: Long): ContentSummary? =
        summaries.findBy(kind, sessionId)?.takeIf { it.isReady() }

    /** Which sittings of the batch have something to tell — all a day card needs to know. */
    fun readySessions(kind: SummaryKind, sessionIds: Collection<Long>): Set<Long> =
        summaries.listBy(kind, sessionIds).filter { it.isReady() }.map { it.sessionId }.toSet()
}
