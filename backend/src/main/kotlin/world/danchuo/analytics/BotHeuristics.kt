package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped

/**
 * Эвристики бота (PRD §5.11): бикон уже отсекает краулеров без JS; дополнительно метим
 * как бота по блоклисту User-Agent и по отсутствию `Accept-Language` (живые браузеры его шлют).
 * Помеченные строки хранятся (сырьё §5.11), но исключаются из приватной сводки.
 */
@ApplicationScoped
class BotHeuristics {

    fun isBot(userAgent: String?, acceptLanguage: String?): Boolean {
        if (acceptLanguage.isNullOrBlank()) return true
        val ua = userAgent?.lowercase() ?: return true
        return BLOCKLIST.any { it in ua }
    }

    /** Тип устройства из User-Agent — грубая эвристика для разреза сводки. */
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
