package world.danchuo.feedback

import java.time.LocalDate

/** The note as it arrives from anybody: every field is dirty until [FeedbackPolicy] has read it. */
data class FeedbackRequest(
    val likedMost: String? = null,
    val wouldChange: String? = null,
    val missingBlock: String? = null,
    val signature: String? = null,
    val path: String? = null,
    val waveKey: String? = null,
    val selectedDay: String? = null,
    val viewportW: Int? = null,
    val viewportH: Int? = null,
    val screenW: Int? = null,
    val screenH: Int? = null,
    val language: String? = null,
    /**
     * The honeypot. A real form keeps this field hidden and empty; anything in it means a bot that
     * filled every input it found. Named like a plausible field, because `honeypot` is a giveaway.
     */
    val website: String? = null,
)

/** A clean note, ready to persist: trimmed, capped, junk dropped. */
data class FeedbackDraft(
    val likedMost: String?,
    val wouldChange: String?,
    val missingBlock: String?,
    val signature: String?,
    val path: String,
    val waveKey: String?,
    val selectedDay: LocalDate?,
    val viewportW: Int?,
    val viewportH: Int?,
    val screenW: Int?,
    val screenH: Int?,
    val language: String?,
)

sealed interface FeedbackOutcome {
    data class Accepted(val draft: FeedbackDraft) : FeedbackOutcome

    /** The honeypot tripped: the caller is answered as if stored, and nothing is written. */
    data object Discarded : FeedbackOutcome

    data class Rejected(val error: String, val field: String?) : FeedbackOutcome
}

/**
 * Reading a submitted note — pure, so the rules are testable without a container. The visitor's
 * own words are REJECTED when over-long; the context is cut silently. Why the two groups differ,
 * and why that asymmetry is load-bearing: PRD §5.19
 */
object FeedbackPolicy {

    fun read(req: FeedbackRequest): FeedbackOutcome {
        if (!req.website.isNullOrBlank()) return FeedbackOutcome.Discarded

        val path = req.path?.trim()?.takeIf { it.isNotEmpty() && it.length <= FeedbackLimits.PATH }
            ?: return FeedbackOutcome.Rejected("missing_field", "path")

        val answers = listOf(
            "likedMost" to req.likedMost,
            "wouldChange" to req.wouldChange,
            "missingBlock" to req.missingBlock,
            "signature" to req.signature,
        )
        for ((field, raw) in answers) {
            val limit = if (field == "signature") FeedbackLimits.SIGNATURE else FeedbackLimits.ANSWER
            if ((raw?.trim()?.length ?: 0) > limit) return FeedbackOutcome.Rejected("too_long", field)
        }

        val likedMost = req.likedMost.answer()
        val wouldChange = req.wouldChange.answer()
        val missingBlock = req.missingBlock.answer()
        if (likedMost == null && wouldChange == null && missingBlock == null) {
            return FeedbackOutcome.Rejected("empty", null)
        }

        return FeedbackOutcome.Accepted(
            FeedbackDraft(
                likedMost = likedMost,
                wouldChange = wouldChange,
                missingBlock = missingBlock,
                signature = req.signature.clean(),
                path = path,
                waveKey = req.waveKey.clean(FeedbackLimits.WAVE_KEY),
                selectedDay = req.selectedDay.toDateOrNull(),
                viewportW = req.viewportW.pixels(),
                viewportH = req.viewportH.pixels(),
                screenW = req.screenW.pixels(),
                screenH = req.screenH.pixels(),
                language = req.language.clean(FeedbackLimits.LANGUAGE),
            ),
        )
    }

    /** Trim to null, then cut to [limit] — context only; the visitor's words are checked first. */
    private fun String?.clean(limit: Int = Int.MAX_VALUE): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }?.take(limit)

    /** Trimmed, and null unless something in it is visible: `trim()` keeps zero-width and filler chars. */
    private fun String?.answer(): String? = clean()?.takeIf { text -> text.any { !it.isInvisible() } }

    private fun Char.isInvisible(): Boolean =
        isWhitespace() || Character.getType(this) == Character.FORMAT.toInt() || this in BLANK_FILLERS

    /** Letters by category that render as nothing (Hangul fillers, the blank Braille cell). */
    private val BLANK_FILLERS = setOf('ᅟ', 'ᅠ', '⠀', 'ㅤ', 'ﾠ')

    private fun Int?.pixels(): Int? = this?.takeIf { it in 1..FeedbackLimits.MAX_PIXELS }

    /** A malformed day is context, not an error: the note is worth more than its anchor. */
    private fun String?.toDateOrNull(): LocalDate? =
        this?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
}
