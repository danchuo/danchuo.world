package world.danchuo.analytics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Эвристики бота (PRD §5.11) — чистая логика, без Quarkus/Docker. Нет `Accept-Language` или
 * бот-UA ⇒ бот; обычный браузер ⇒ не бот; тип устройства по UA.
 */
class BotHeuristicsTest {

    private val bots = BotHeuristics()
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    @Test
    fun `missing accept-language is a bot`() {
        assertTrue(bots.isBot(chrome, null))
        assertTrue(bots.isBot(chrome, "  "))
    }

    @Test
    fun `known crawler UA is a bot`() {
        assertTrue(bots.isBot("Googlebot/2.1 (+http://www.google.com/bot.html)", "en"))
        assertTrue(bots.isBot("curl/8.0", "en"))
    }

    @Test
    fun `normal browser with accept-language is not a bot`() {
        assertFalse(bots.isBot(chrome, "en-US,en;q=0.9"))
    }

    @Test
    fun `device type is derived from UA`() {
        assertEquals(DeviceType.DESKTOP, bots.deviceType(chrome))
        assertEquals(DeviceType.MOBILE, bots.deviceType("iPhone; CPU iPhone OS 17 like Mac OS X Mobile"))
        assertEquals(DeviceType.TABLET, bots.deviceType("Mozilla/5.0 (iPad; CPU OS 17)"))
    }
}
