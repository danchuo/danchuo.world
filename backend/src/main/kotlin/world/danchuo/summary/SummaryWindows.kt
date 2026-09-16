package world.danchuo.summary

/**
 * How a long passage is squeezed under one model call's ceiling. It must NOT be cut at the start:
 * the summary would fall silent exactly where the owner stopped, the most memorable spot. Instead,
 * even windows across the length, the last flush to the end, with gaps marked. PRD §5.16
 */
object SummaryWindows {

    const val WINDOWS = 4

    /** A window thinner than this is not worth retelling; one connected excerpt is taken instead. */
    const val MIN_WINDOW = 300

    /** An explicit break between windows: the model must SEE a gap rather than invent a bridge. */
    const val GAP = "\n\n[…]\n\n"

    /**
     * Squeezes [text] to [maxChars]: if it fits it is returned as is, otherwise it is cut into
     * windows across the whole length. Under a very small ceiling windows are not used — one
     * connected excerpt from the start is honester than four fragments of a few words.
     */
    fun cap(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val budget = maxChars - (WINDOWS - 1) * GAP.length
        if (budget / WINDOWS < MIN_WINDOW) return word(text, maxChars)

        val window = budget / WINDOWS
        val step = (text.length - window) / (WINDOWS - 1)
        return (0 until WINDOWS).joinToString(GAP) { i ->
            val start = if (i == WINDOWS - 1) text.length - window else i * step
            word(text.substring(start, start + window), window).trim()
        }
    }

    /** Cuts on a word boundary so an excerpt never breaks mid-letter. */
    fun word(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val cut = text.take(maxChars)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace > maxChars / 2) cut.take(lastSpace) else cut
    }
}
