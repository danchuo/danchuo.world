package world.danchuo.feedback

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.core.security.BotHeuristics
import world.danchuo.core.security.DeviceType
import world.danchuo.core.security.VisitorHash
import java.time.Clock
import java.time.Instant

/** One note as the owner reads it in the admin; the visitor never reads any of this back. */
data class FeedbackNoteView(
    val id: Long,
    val submittedAt: Instant,
    val likedMost: String?,
    val wouldChange: String?,
    val missingBlock: String?,
    val signature: String?,
    val path: String,
    val waveKey: String?,
    val selectedDay: String?,
    val deviceType: DeviceType,
    val viewportW: Int?,
    val viewportH: Int?,
    val screenW: Int?,
    val screenH: Int?,
    val language: String?,
    val userAgent: String?,
    // Runtime Jackson has no Kotlin module (test-only dep) and strips the "is" prefix from
    // boolean getters — pin the wire name to what the frontend type expects.
    @get:JsonProperty("isBot")
    val isBot: Boolean,
)

/**
 * The note slice's logic. Rules live in the pure [FeedbackPolicy]; this class only adds what
 * needs a request behind it — the visitor hash, the bot mark, the clock — and the database.
 * The write is defended in echelons: edge, rate limit, honeypot, caps. PRD §5.19, §11
 */
@ApplicationScoped
class FeedbackService(
    private val repository: FeedbackRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
) {

    /**
     * Stores a note, or says why not. A discarded honeypot returns [FeedbackOutcome.Discarded] and
     * writes nothing — the caller is told the same thing a stored note is told, so a bot learns
     * nothing about the trap it walked into.
     */
    @Transactional
    fun submit(
        request: FeedbackRequest,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ): FeedbackOutcome {
        val outcome = FeedbackPolicy.read(request)
        if (outcome !is FeedbackOutcome.Accepted) return outcome

        val draft = outcome.draft
        val note = FeedbackNote().apply {
            this.submittedAt = Instant.now(clock)
            this.likedMost = draft.likedMost
            this.wouldChange = draft.wouldChange
            this.missingBlock = draft.missingBlock
            this.signature = draft.signature
            this.path = draft.path
            this.waveKey = draft.waveKey
            this.selectedDay = draft.selectedDay
            this.deviceType = bots.deviceType(userAgent)
            this.viewportW = draft.viewportW
            this.viewportH = draft.viewportH
            this.screenW = draft.screenW
            this.screenH = draft.screenH
            this.language = draft.language ?: acceptLanguage?.take(FeedbackLimits.LANGUAGE)
            this.userAgent = userAgent?.take(FeedbackLimits.USER_AGENT)
            this.visitorDayHash = visitorHash.of(ip, userAgent ?: "")
            this.isBot = bots.isBot(userAgent, acceptLanguage)
        }
        repository.persist(note)
        return outcome
    }

    fun list(): List<FeedbackNoteView> = repository.listNewestFirst().map { it.toView() }

    /** Returns false when the note was already gone — a repeated delete is not an error. */
    @Transactional
    fun delete(id: Long): Boolean = repository.deleteById(id)

    private fun FeedbackNote.toView() = FeedbackNoteView(
        id = id ?: 0,
        submittedAt = submittedAt,
        likedMost = likedMost,
        wouldChange = wouldChange,
        missingBlock = missingBlock,
        signature = signature,
        path = path,
        waveKey = waveKey,
        selectedDay = selectedDay?.toString(),
        deviceType = deviceType,
        viewportW = viewportW,
        viewportH = viewportH,
        screenW = screenW,
        screenH = screenH,
        language = language,
        userAgent = userAgent,
        isBot = isBot,
    )
}
