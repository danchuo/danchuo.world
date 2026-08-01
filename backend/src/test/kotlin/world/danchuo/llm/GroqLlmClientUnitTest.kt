package world.danchuo.llm

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.Optional

/**
 * Pure unit tests for the degradation contract of [GroqLlmClient]: no api-key ⇒ no external
 * call and `null`; a provider failure also collapses to `null` (callers never see exceptions).
 */
class GroqLlmClientUnitTest {

    private class ThrowingApi : GroqApi {
        var calls = 0
        override fun chat(authorization: String, request: ChatRequest): ChatResponse {
            calls++
            throw IllegalStateException("provider down")
        }
    }

    private fun client(api: GroqApi, key: Optional<String>) =
        GroqLlmClient(api, key, "text-model", "vision-model", Optional.of("none"))

    @Test
    fun `blank api-key skips the external call and returns null`() {
        val api = ThrowingApi()
        val c = client(api, Optional.of("  "))
        assertNull(c.completeText("s", "u"))
        assertNull(c.completeVision("s", "u", LlmImage(byteArrayOf(1), "image/jpeg")))
        assertEquals(0, api.calls)
    }

    @Test
    fun `provider failure collapses to null instead of throwing`() {
        val api = ThrowingApi()
        val c = client(api, Optional.of("key"))
        assertNull(c.completeText("s", "u"))
        assertEquals(1, api.calls)
    }
}
