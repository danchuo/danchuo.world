package world.danchuo.core.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Who the request is from (PRD §8). A pure test, no Quarkus: the whole contract is one header.
 */
class ClientIpTest {

    @Test
    fun `a single entry is the client`() {
        assertEquals("203.0.113.10", ClientIp.fromForwardedFor("203.0.113.10"))
    }

    @Test
    fun `the client is the LAST hop - the one the proxy appended`() {
        // Caddy appends the real peer to whatever arrived, so the tail is ours and the head is
        // the client's. Taking the head would let anyone pick their own identity per request.
        assertEquals("198.51.100.7", ClientIp.fromForwardedFor("1.2.3.4, 198.51.100.7"))
    }

    @Test
    fun `a forged chain cannot move the client into a fresh bucket`() {
        val forged = { spoof: String -> ClientIp.fromForwardedFor("$spoof, 198.51.100.7") }
        assertEquals(forged("10.0.0.1"), forged("10.0.0.2"))
    }

    @Test
    fun `whitespace around entries is trimmed`() {
        assertEquals("198.51.100.7", ClientIp.fromForwardedFor("1.2.3.4,   198.51.100.7  "))
    }

    @Test
    fun `absent or blank header has no client`() {
        assertNull(ClientIp.fromForwardedFor(null))
        assertNull(ClientIp.fromForwardedFor(""))
        assertNull(ClientIp.fromForwardedFor("   "))
        assertNull(ClientIp.fromForwardedFor("1.2.3.4,   "))
    }
}
