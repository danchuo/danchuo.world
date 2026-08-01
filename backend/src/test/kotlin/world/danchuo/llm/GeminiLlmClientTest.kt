package world.danchuo.llm

import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Base64

/**
 * White-box test of the real Gemini client against a stubbed endpoint. Covers the parts a fake
 * LlmClient can't validate: the api-key header, the model in the URL path, the inline-image
 * envelope, and the structured-output config that keeps replies parseable.
 */
@QuarkusTest
@QuarkusTestResource(value = WireMockGeminiResource::class, restrictToAnnotatedClass = true)
class GeminiLlmClientTest {

    @Inject
    lateinit var gemini: GeminiLlmClient

    @Test
    fun `text completion sends the api key header and the prompt payload`() {
        val reply = gemini.completeText("SYSTEM_MARKER", "USER_MARKER")
        assertEquals(WireMockGeminiResource.STUB_REPLY, reply)

        val last = lastRequest()
        assertEquals("test-gemini-key", last.getHeader("x-goog-api-key"))
        assertTrue(last.url.contains("test-gemini-text")) { "text model in path, got: ${last.url}" }
        val body = last.bodyAsString
        assertTrue(body.contains("SYSTEM_MARKER")) { "system prompt in payload, got: $body" }
        assertTrue(body.contains("USER_MARKER")) { "user prompt in payload, got: $body" }
    }

    @Test
    fun `vision completion sends the image inline and targets the vision model`() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        val reply = gemini.completeVision("SYS_V", "USER_V", LlmImage(bytes, "image/jpeg"))
        assertEquals(WireMockGeminiResource.STUB_REPLY, reply)

        val last = lastRequest()
        assertTrue(last.url.contains("test-gemini-vision")) {
            "vision model in path, got: ${last.url}"
        }
        val body = last.bodyAsString
        assertTrue(body.contains("inline_data")) { "inline image part in payload, got: $body" }
        assertTrue(body.contains("image/jpeg")) { "mime type in payload, got: $body" }
        assertTrue(body.contains(Base64.getEncoder().encodeToString(bytes))) {
            "base64 payload, got: $body"
        }
    }

    @Test
    fun `json completion asks the model to honour the schema`() {
        val schema = """{"type":"OBJECT","properties":{"present":{"type":"BOOLEAN"}}}"""
        val reply = gemini.completeVisionJson(
            "SYS_J",
            "USER_J",
            LlmImage(byteArrayOf(9), "image/jpeg"),
            schema,
        )
        assertEquals(WireMockGeminiResource.STUB_REPLY, reply)

        val body = lastRequest().bodyAsString
        assertTrue(body.contains("application/json")) { "response mime type, got: $body" }
        assertTrue(body.contains("responseSchema")) { "schema in payload, got: $body" }
        assertTrue(body.contains("BOOLEAN")) { "schema contents forwarded, got: $body" }
    }

    @Test
    fun `plain vision call carries no schema so the model answers freely`() {
        gemini.completeVision("SYS_P", "USER_P", LlmImage(byteArrayOf(7), "image/jpeg"))
        val body = lastRequest().bodyAsString
        assertFalse(body.contains("responseSchema")) { "no schema expected, got: $body" }
    }

    private fun lastRequest() = WireMockGeminiResource.server!!
        .findAll(postRequestedFor(urlPathMatching("/v1beta/models/.*")))
        .also { assertTrue(it.isNotEmpty()) { "Gemini endpoint should have been called" } }
        .last()
}
