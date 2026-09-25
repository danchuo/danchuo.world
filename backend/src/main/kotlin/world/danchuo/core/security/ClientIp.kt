package world.danchuo.core.security

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

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
        header?.split(',')?.lastOrNull()?.trim()?.takeIf { it.isNotBlank() }?.let(::clientOf)

    /** An IPv6 client is its /64: one host holds the whole prefix, so per-address keys are free buckets. PRD §8 */
    private fun clientOf(ip: String): String {
        // Only a literal with ':' is parsed — anything else could make InetAddress resolve a hostname.
        if (':' !in ip) return ip
        return when (val addr = runCatching { InetAddress.getByName(ip.substringBefore('%')) }.getOrNull()) {
            is Inet4Address -> addr.hostAddress
            is Inet6Address -> addr.address.let { b ->
                (0 until 4).joinToString(":", postfix = "::/64") { i ->
                    Integer.toHexString(((b[2 * i].toInt() and 0xff) shl 8) or (b[2 * i + 1].toInt() and 0xff))
                }
            }
            else -> ip
        }
    }
}
