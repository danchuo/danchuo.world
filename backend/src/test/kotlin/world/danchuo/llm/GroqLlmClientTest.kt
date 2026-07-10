package world.danchuo.llm

import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Base64

/**
 * White-box test of the real Groq client against a stubbed endpoint — covers the request shape
 * (auth header + payload, incl. the multimodal vision envelope) and reply extraction, the parts
 * a fake LlmClient can't validate.
 */
@QuarkusTest
@QuarkusTestResource(value = WireMockGroqResource::class, restrictToAnnotatedClass = true)
class GroqLlmClientTest {

    @Inject
    lateinit var groq: GroqLlmClient

    @Test
    fun `text completion sends bearer auth and the chat payload`() {
        val reply = groq.completeText("SYSTEM_MARKER", "USER_MARKER")
        assertEquals(WireMockGroqResource.STUB_REPLY, reply)

        val last = lastChatRequest()
        assertEquals("Bearer test-groq-key", last.getHeader("Authorization"))
        val body = last.bodyAsString
        assertTrue(body.contains("test-text-model")) { "text model in payload, got: $body" }
        assertTrue(body.contains("SYSTEM_MARKER")) { "system prompt in payload, got: $body" }
        assertTrue(body.contains("USER_MARKER")) { "user prompt in payload, got: $body" }
    }

    @Test
    fun `vision completion sends the image as a base64 data url`() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        val reply = groq.completeVision("SYS_V", "USER_V", LlmImage(bytes, "image/jpeg"))
        assertEquals(WireMockGroqResource.STUB_REPLY, reply)

        val body = lastChatRequest().bodyAsString
        val expectedDataUrl = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes)
        assertTrue(body.contains("test-vision-model")) { "vision model in payload, got: $body" }
        assertTrue(body.contains("\"image_url\"")) { "image part in payload, got: $body" }
        assertTrue(body.contains(expectedDataUrl)) { "data url in payload, got: $body" }
        assertTrue(body.contains("USER_V")) { "text part in payload, got: $body" }
        assertTrue(body.contains("SYS_V")) { "system prompt in payload, got: $body" }
    }

    private fun lastChatRequest() = WireMockGroqResource.server!!
        .findAll(postRequestedFor(urlPathEqualTo("/openai/v1/chat/completions")))
        .also { assertTrue(it.isNotEmpty()) { "Groq endpoint should have been called" } }
        .last()
}
