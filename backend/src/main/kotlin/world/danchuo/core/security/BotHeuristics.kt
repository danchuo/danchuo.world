package world.danchuo.core.security

import jakarta.enterprise.context.ApplicationScoped

/** Visitor device type, derived from the User-Agent (PRD §7). */
enum class DeviceType { MOBILE, TABLET, DESKTOP }

/**
 * Bot heuristics: a User-Agent blocklist plus a missing `Accept-Language` (live browsers send it).
 * A marked row is still stored as raw material but stays out of what the owner reads. Shared by
 * every public endpoint anyone may post to — analytics and feedback alike. PRD §5.11, §5.19
 */
@ApplicationScoped
class BotHeuristics {

    fun isBot(userAgent: String?, acceptLanguage: String?): Boolean {
        if (acceptLanguage.isNullOrBlank()) return true
        val ua = userAgent?.lowercase() ?: return true
        return BLOCKLIST.any { it in ua }
    }

    fun deviceType(userAgent: String?): DeviceType {
        val ua = userAgent?.lowercase() ?: return DeviceType.DESKTOP
        return when {
            "ipad" in ua || ("tablet" in ua && "mobile" !in ua) -> DeviceType.TABLET
            "mobi" in ua || "iphone" in ua || "android" in ua -> DeviceType.MOBILE
            else -> DeviceType.DESKTOP
        }
    }

    private companion object {
        val BLOCKLIST = listOf(
            "bot", "crawler", "spider", "slurp", "curl", "wget", "python-requests",
            "headless", "phantomjs", "monitor", "preview", "fetch", "scrap",
        )
    }
}
