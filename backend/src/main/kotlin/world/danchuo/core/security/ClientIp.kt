package world.danchuo.core.security

/**
 * Who the request is from — the one definition shared by the rate limiter and the visitor hash,
 * because a client the limiter and the analytics disagree about is a client neither of them
 * counts. PRD §8
 */
object ClientIp {

    /**
     * The real client behind ONE trusted hop: the LAST entry, the one Caddy appended. Everything
     * before it arrived from outside and is forgeable, so keying on the head lets anyone rotate
     * into a fresh bucket. Add a second proxy in front and this has to count hops instead.
     */
    fun fromForwardedFor(header: String?): String? =
        header?.split(',')?.lastOrNull()?.trim()?.takeIf { it.isNotBlank() }
}
