package world.danchuo.instagram

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Разбор ответов Instagram: форма поля важнее его содержимого — рассинхрон роняет ВЕСЬ обмен
 * кода, а лечится он только повторным заходом владельца в браузер (PRD §5.17).
 */
class InstagramClientsTest {

    private val mapper = ObjectMapper().registerKotlinModule()

    @Test
    fun `короткий токен разбирается, когда permissions пришли массивом`() {
        val json = """{"access_token":"IGAA-short","user_id":17841400000000000,"permissions":["instagram_business_basic"]}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
        assertEquals(listOf("instagram_business_basic"), parsed.permissions)
    }

    @Test
    fun `короткий токен разбирается, когда permissions пришли строкой`() {
        val json = """{"access_token":"IGAA-short","permissions":"instagram_business_basic"}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals(listOf("instagram_business_basic"), parsed.permissions)
    }

    @Test
    fun `отсутствие permissions не ломает разбор`() {
        val parsed = mapper.readValue("""{"access_token":"IGAA-short"}""", InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
        assertNull(parsed.permissions)
    }

    @Test
    fun `незнакомое поле не ломает разбор`() {
        val json = """{"access_token":"IGAA-short","permissions":["a"],"something_new":{"nested":[1,2]}}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
    }

    /**
     * Время поста. Instagram пишет смещение БЕЗ двоеточия (`+0000`) — такую форму не берёт ни
     * `OffsetDateTime.parse`, ни `Instant.parse`, и пост молча уезжает в Instant.EPOCH:
     * на борде это «20710 дн назад».
     */
    @Test
    fun `время поста разбирается со смещением без двоеточия`() {
        assertEquals(
            Instant.parse("2026-08-29T17:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31+0000"),
        )
    }

    @Test
    fun `время поста разбирается со смещением через двоеточие`() {
        assertEquals(
            Instant.parse("2026-08-29T14:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31+03:00"),
        )
    }

    @Test
    fun `время поста разбирается в форме Z`() {
        assertEquals(
            Instant.parse("2026-08-29T17:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31Z"),
        )
    }

    @Test
    fun `неразбираемое время не роняет разбор, а отдаёт null`() {
        assertNull(parseInstagramTimestamp("вчера вечером"))
    }
}
