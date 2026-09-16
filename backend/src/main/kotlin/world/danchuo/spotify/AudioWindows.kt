package world.danchuo.spotify

/** A file chunk to download: inclusive byte bounds for the `Range` header. */
data class ByteWindow(val from: Long, val to: Long) {

    /** The `Range` header value, exactly as podcast hosting understands it. */
    fun header(): String = "bytes=$from-$to"

    val length: Long get() = to - from + 1
}

/**
 * Where to cut an episode's audio so the listened passage can be transcribed. Audio is cut BEFORE
 * transcription, offsets are fractions of FILE SIZE rather than milliseconds, and no ffmpeg is
 * needed. All three decisions, with the measurements behind them: PRD §5.16.1.
 */
object AudioWindows {

    /**
     * Byte windows of the listened passage (fractions 0..1 of the file). A passage shorter than
     * the whole budget is taken WHOLE — connected speech summarises better. A long one is cut into
     * [count] windows with the last pinned to the end, the most memorable spot. Empty list = no cut.
     */
    fun windows(
        totalBytes: Long,
        durationMs: Long,
        from: Double,
        to: Double,
        count: Int,
        windowMs: Long,
    ): List<ByteWindow> {
        if (totalBytes <= 0 || durationMs <= 0 || count <= 0) return emptyList()

        val start = (from.coerceIn(0.0, 1.0) * totalBytes).toLong()
        val end = (to.coerceIn(0.0, 1.0) * totalBytes).toLong()
        val stretch = end - start
        if (stretch <= 0) return emptyList()

        val windowBytes = (windowMs.toDouble() / durationMs * totalBytes).toLong().coerceAtLeast(1)
        if (stretch <= windowBytes * count) return listOf(ByteWindow(start, end - 1))

        // Step between window starts: the first from the chunk's start, the last flush to its end.
        val step = (stretch - windowBytes) / (count - 1)
        return (0 until count).map { i ->
            val at = if (i == count - 1) end - windowBytes else start + i * step
            ByteWindow(at, at + windowBytes - 1)
        }
    }
}
