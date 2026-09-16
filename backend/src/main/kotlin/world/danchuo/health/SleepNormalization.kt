package world.danchuo.health

/** One night's sleep metrics as ingest sends them (duration + phases). All nullable (§5.4). */
data class SleepInput(
    val minutes: Int?,
    val rem: Int?,
    val deep: Int?,
    val light: Int?,
    val awake: Int?,
)

/**
 * The one exception to `null != 0`: sleep has no meaningful real zero, and a 0-minute night means
 * the shortcut found no session at all. Such a night collapses ENTIRELY into "no data", duration
 * and phases alike. A real night (>0) is untouched, including a zero inside one phase. PRD §5.4
 */
object SleepNormalization {

    private val NONE = SleepInput(null, null, null, null, null)

    fun normalize(input: SleepInput): SleepInput =
        if (input.minutes == 0) NONE else input
}
