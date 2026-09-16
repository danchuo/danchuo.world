package world.danchuo.llm

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Typed
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.util.Base64
import java.util.Optional

/**
 * Default production [LlmClient], on Groq's OpenAI-compatible API. With no api-key configured
 * it makes no call and returns `null`, so dev/test/CI break nothing and spend nothing; any
 * transport or provider error collapses to `null` the same way.
 */
@ApplicationScoped
@Typed(GroqLlmClient::class)
class GroqLlmClient(
    @param:RestClient private val api: GroqApi,
    @param:ConfigProperty(name = "danchuo.llm.api-key") private val apiKey: Optional<String>,
    @param:ConfigProperty(name = "danchuo.llm.model") private val model: String,
    @param:ConfigProperty(name = "danchuo.llm.vision-model") private val visionModel: String,
    @param:ConfigProperty(name = "danchuo.llm.reasoning-effort")
    private val reasoningEffort: Optional<String>,
) : LlmClient, LlmTextProvider {

    private val log: Logger = Logger.getLogger(GroqLlmClient::class.java)

    override fun completeText(systemPrompt: String, userPrompt: String): String? {
        // Warmer temperature — the intended text use is generative (humorous search replies).
        return completeText(
            systemPrompt,
            userPrompt,
            LlmTextCall(
                model = model,
                temperature = 0.7,
                reasoningEffort = reasoningEffort.map { it.trim() }.filter { it.isNotEmpty() }.orElse(null),
            ),
        )
    }

    override fun completeText(systemPrompt: String, userPrompt: String, call: LlmTextCall): String? = chat(
        call = call,
        messages = listOf(
            ChatMessage("system", systemPrompt),
            ChatMessage("user", userPrompt),
        ),
    )

    override fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage): String? {
        val dataUrl = "data:${image.mediaType};base64," +
            Base64.getEncoder().encodeToString(image.bytes)
        // Near-deterministic — the intended vision use is classification (photo orientation).
        return chat(
            call = LlmTextCall(
                model = visionModel,
                temperature = 0.1,
                reasoningEffort = reasoningEffort.map { it.trim() }.filter { it.isNotEmpty() }.orElse(null),
            ),
            messages = listOf(
                ChatMessage("system", systemPrompt),
                ChatMessage(
                    "user",
                    listOf(
                        TextPart(userPrompt),
                        ImagePart(ImageUrl(dataUrl)),
                    ),
                ),
            ),
        )
    }

    private fun chat(call: LlmTextCall, messages: List<ChatMessage>): String? {
        val key = apiKey.map { it.trim() }.orElse("")
        if (key.isBlank()) {
            log.debug("LLM api-key not configured — skipping external call, returning null.")
            return null
        }
        return try {
            api.chat(
                "Bearer $key",
                ChatRequest(
                    model = call.model,
                    messages = messages,
                    temperature = call.temperature,
                    reasoningEffort = call.reasoningEffort,
                ),
            ).choices.firstOrNull()?.message?.content
                // A safety net: if the model did think aloud, the answer follows the block.
                ?.replace(THINK_BLOCK, "")?.trim()?.ifBlank { null }
        } catch (e: Exception) {
            log.error("Groq request failed", e)
            null
        }
    }

    private companion object {
        val THINK_BLOCK = Regex("<think>.*?</think>", RegexOption.DOT_MATCHES_ALL)
    }
}
