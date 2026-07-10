package world.danchuo.llm

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager

/**
 * Stands in for Groq's OpenAI-compatible API so the real [GroqLlmClient] HTTP/JSON path is
 * exercised without spending tokens (ported from proxemics). The stub replies to every chat
 * completion with a fixed assistant message.
 */
class WireMockGroqResource : QuarkusTestResourceLifecycleManager {

    companion object {
        @Volatile
        var server: WireMockServer? = null
            private set

        const val STUB_REPLY = "stubbed model reply"

        private const val RESPONSE_BODY =
            """{"choices":[{"message":{"role":"assistant","content":"$STUB_REPLY"}}]}"""
    }

    override fun start(): Map<String, String> {
        val wm = WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort())
        wm.start()
        server = wm
        wm.stubFor(
            post(urlPathEqualTo("/openai/v1/chat/completions"))
                .willReturn(
                    aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(RESPONSE_BODY),
                ),
        )
        return mapOf(
            "quarkus.rest-client.groq.url" to "http://localhost:${wm.port()}",
            "danchuo.llm.api-key" to "test-groq-key",
            "danchuo.llm.model" to "test-text-model",
            "danchuo.llm.vision-model" to "test-vision-model",
        )
    }

    override fun stop() {
        server?.stop()
        server = null
    }
}
