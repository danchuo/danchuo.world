package world.danchuo.tierlist

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.core.security.BotHeuristics
import world.danchuo.core.security.VisitorHash
import java.time.Clock
import java.time.Instant

/** A published tier list as the board shows it. */
data class TierlistView(
    val id: Long,
    val submittedAt: Instant,
    val nick: String?,
    val tiers: Map<String, List<String>>,
)

/** The owner's row: the public view plus the bot mark. */
data class TierlistAdminView(
    val id: Long,
    val submittedAt: Instant,
    val nick: String?,
    val tiers: Map<String, List<String>>,
    // Runtime Jackson strips "is" from boolean getters — pin the wire name. See FeedbackNoteView.
    @get:JsonProperty("isBot")
    val isBot: Boolean,
)

/** The tier list slice's logic; rules live in the pure [TierlistPolicy]. PRD §5.20 */
@ApplicationScoped
class TierlistService(
    private val repository: TierlistRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val mapper: ObjectMapper,
    private val clock: Clock,
) {

    @Transactional
    fun publish(request: TierlistRequest, ip: String, userAgent: String?, acceptLanguage: String?): TierlistOutcome {
        val outcome = TierlistPolicy.read(request)
        if (outcome !is TierlistOutcome.Accepted) return outcome
        val requested = outcome.draft.nick
        if (requested != null && repository.nickTaken(requested)) return TierlistOutcome.Rejected(NICK_TAKEN, "nick")

        val entry = TierlistEntry().apply {
            submittedAt = Instant.now(clock)
            nick = outcome.draft.nick
            placements = mapper.writeValueAsString(outcome.draft.tiers)
            visitorDayHash = visitorHash.of(ip, userAgent ?: "")
            isBot = bots.isBot(userAgent, acceptLanguage)
        }
        repository.persist(entry)
        return outcome.copy(id = entry.id ?: 0)
    }

    fun listPublic(): List<TierlistView> =
        repository.publicNewestFirst(PUBLIC_LIMIT).map { TierlistView(it.id ?: 0, it.submittedAt, it.nick, it.tiers()) }

    fun listAll(): List<TierlistAdminView> =
        repository.allNewestFirst().map { TierlistAdminView(it.id ?: 0, it.submittedAt, it.nick, it.tiers(), it.isBot) }

    /** Returns false when the list was already gone — a repeated delete is not an error. */
    @Transactional
    fun delete(id: Long): Boolean = repository.deleteById(id)

    private fun TierlistEntry.tiers(): Map<String, List<String>> = mapper.readValue(placements, TIERS_TYPE)

    companion object {
        const val NICK_TAKEN = "nick_taken"
        private const val PUBLIC_LIMIT = 200
        private val TIERS_TYPE = object : TypeReference<Map<String, List<String>>>() {}
    }
}
