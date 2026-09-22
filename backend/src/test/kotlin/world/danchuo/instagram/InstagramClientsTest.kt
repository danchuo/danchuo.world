package world.danchuo.instagram

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Parsing Instagram replies: the shape of a field matters more than its content — a mismatch
 * sinks the WHOLE code exchange, and only the owner re-authorising in a browser fixes it (PRD §5.17).
 */
class InstagramClientsTest {

    private val mapper = ObjectMapper().registerKotlinModule()

    @Test
    fun `a short token is parsed when permissions come as an array`() {
        val json = """{"access_token":"IGAA-short","user_id":17841400000000000,"permissions":["instagram_business_basic"]}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
        assertEquals(listOf("instagram_business_basic"), parsed.permissions)
    }

    @Test
    fun `a short token is parsed when permissions come as a string`() {
        val json = """{"access_token":"IGAA-short","permissions":"instagram_business_basic"}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals(listOf("instagram_business_basic"), parsed.permissions)
    }

    @Test
    fun `missing permissions do not break parsing`() {
        val parsed = mapper.readValue("""{"access_token":"IGAA-short"}""", InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
        assertNull(parsed.permissions)
    }

    @Test
    fun `an unknown field does not break parsing`() {
        val json = """{"access_token":"IGAA-short","permissions":["a"],"something_new":{"nested":[1,2]}}"""

        val parsed = mapper.readValue(json, InstagramShortTokenResponse::class.java)

        assertEquals("IGAA-short", parsed.accessToken)
    }

    /**
     * Instagram writes the offset WITHOUT a colon (`+0000`), which neither `OffsetDateTime.parse`
     * nor `Instant.parse` accepts: the post silently lands on Instant.EPOCH, "20710 d ago" on the board.
     */
    @Test
    fun `the post time is parsed with an offset without a colon`() {
        assertEquals(
            Instant.parse("2026-08-29T17:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31+0000"),
        )
    }

    @Test
    fun `the post time is parsed with an offset with a colon`() {
        assertEquals(
            Instant.parse("2026-08-29T14:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31+03:00"),
        )
    }

    @Test
    fun `the post time is parsed in the Z form`() {
        assertEquals(
            Instant.parse("2026-08-29T17:20:31Z"),
            parseInstagramTimestamp("2026-08-29T17:20:31Z"),
        )
    }

    @Test
    fun `an unparseable time does not break parsing but returns null`() {
        assertNull(parseInstagramTimestamp("вчера вечером"))
    }
}
