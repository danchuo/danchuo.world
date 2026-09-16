package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped

/**
 * Bot heuristics (PRD §5.11): the beacon already drops crawlers without JS; on top of that we
 * mark a bot by a User-Agent blocklist and by a missing `Accept-Language` (live browsers send it).
 * Marked rows are still stored as raw material but stay out of the private summary.
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
