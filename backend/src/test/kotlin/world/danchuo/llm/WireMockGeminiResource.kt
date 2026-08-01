package world.danchuo.llm

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager

/**
 * Stands in for Google's Generative Language API so the real [GeminiLlmClient] HTTP/JSON path is
 * exercised without spending quota (sibling of [WireMockGroqResource]). Gemini puts the model in
 * the path and separates it from the verb with a colon — `/v1beta/models/{model}:generateContent`
 * — so the stub matches by pattern rather than an exact path.
 */
class WireMockGeminiResource : QuarkusTestResourceLifecycleManager {

    companion object {
        @Volatile
        var server: WireMockServer? = null
            private set

        /** What the model "answers" — itself JSON, as structured output would be. */
        const val STUB_REPLY = """{"present":true,"box_2d":[100,200,600,700]}"""

        /** The reply travels inside a JSON string field, so its quotes have to be escaped. */
        private val RESPONSE_BODY =
            """{"candidates":[{"content":{"parts":[{"text":"${STUB_REPLY.replace("\"", "\\\"")}"}]}}]}"""
    }

    override fun start(): Map<String, String> {
        val wm = WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort())
        wm.start()
        server = wm
        wm.stubFor(
            post(urlPathMatching("/v1beta/models/.*"))
                .willReturn(
                    aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(RESPONSE_BODY),
                ),
        )
        return mapOf(
            "quarkus.rest-client.gemini.url" to "http://localhost:${wm.port()}",
            "danchuo.llm.provider" to "gemini",
            "danchuo.gemini.api-key" to "test-gemini-key",
            "danchuo.gemini.model" to "test-gemini-text",
            "danchuo.gemini.vision-model" to "test-gemini-vision",
        )
    }

    override fun stop() {
        server?.stop()
        server = null
    }
}
