package world.danchuo.tierlist

/** A tier list as it arrives from anybody: `tiers` maps a tier letter to shirt ids, best first. */
data class TierlistRequest(
    val nick: String? = null,
    val tiers: Map<String, List<String>>? = null,
    /** The honeypot, as in the note form: hidden and empty for a person. */
    val website: String? = null,
)

/** A clean placement: every tier of [TierlistPolicy.TIERS] present, in that order. */
data class TierlistDraft(
    val nick: String?,
    val tiers: Map<String, List<String>>,
)

sealed interface TierlistOutcome {
    /** [id] is 0 until the service stores the list. */
    data class Accepted(val draft: TierlistDraft, val id: Long = 0) : TierlistOutcome

    /** The honeypot tripped: answered as if stored, nothing written. */
    data object Discarded : TierlistOutcome

    data class Rejected(val error: String, val field: String? = null) : TierlistOutcome
}

/**
 * Reading a published tier list — pure. The server checks the SHAPE only: the shirt catalogue is
 * hard-coded in the frontend, which also demands every shirt be placed before publishing. §5.20
 */
object TierlistPolicy {
    val TIERS = listOf("S", "A", "B", "C", "D")

    /** Equal to the `nick` column width in `1120-tierlist`. */
    const val NICK_MAX = 40
    const val MAX_ITEMS = 64

    private val ITEM_ID = Regex("^[a-z0-9-]{1,40}$")

    fun read(req: TierlistRequest): TierlistOutcome {
        if (!req.website.isNullOrBlank()) return TierlistOutcome.Discarded

        val nick = req.nick?.trim()
        if ((nick?.length ?: 0) > NICK_MAX) return TierlistOutcome.Rejected("too_long", "nick")

        val raw = req.tiers.orEmpty()
        if (raw.keys.any { it !in TIERS }) return TierlistOutcome.Rejected("bad_tier")

        val items = raw.values.flatten()
        if (items.isEmpty()) return TierlistOutcome.Rejected("empty")
        if (items.size > MAX_ITEMS) return TierlistOutcome.Rejected("too_many")
        if (items.any { !ITEM_ID.matches(it) }) return TierlistOutcome.Rejected("bad_item")
        if (items.toSet().size != items.size) return TierlistOutcome.Rejected("duplicate_item")

        return TierlistOutcome.Accepted(
            TierlistDraft(
                nick = nick?.takeIf { text -> text.any { !it.isInvisible() } },
                tiers = TIERS.associateWith { raw[it].orEmpty() },
            ),
        )
    }

    private fun Char.isInvisible(): Boolean =
        isWhitespace() || Character.getType(this) == Character.FORMAT.toInt() || this in BLANK_FILLERS

    /** Letters by category that render as nothing (Hangul fillers, the blank Braille cell). */
    private val BLANK_FILLERS = setOf('ᅟ', 'ᅠ', '⠀', 'ㅤ', 'ﾠ')
}
