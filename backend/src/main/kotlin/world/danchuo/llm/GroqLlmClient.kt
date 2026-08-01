package world.danchuo.llm

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Typed
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.util.Base64
import java.util.Optional

/**
 * Default production [LlmClient]: talks to Groq's OpenAI-compatible API (ported from proxemics).
 *
 * Mirrors the Spotify-slice convention — when no api-key is configured (dev/test/CI) it makes no
 * external call and returns `null`, so nothing breaks and no tokens are spent. Any transport or
 * provider error is logged and also collapses to `null`; callers degrade gracefully.
 */
@ApplicationScoped
@Typed(GroqLlmClient::class)
class GroqLlmClient(
    @param:RestClient private val api: GroqApi,
    @param:ConfigProperty(name = "danchuo.llm.api-key") private val apiKey: Optional<String>,
    @param:ConfigProperty(name = "danchuo.llm.model") private val model: String,
    @param:ConfigProperty(name = "danchuo.llm.vision-model") private val visionModel: String,
) : LlmClient {

    private val log: Logger = Logger.getLogger(GroqLlmClient::class.java)

    override fun completeText(systemPrompt: String, userPrompt: String): String? {
        // Warmer temperature — the intended text use is generative (humorous search replies).
        return chat(
            model = model,
            temperature = 0.7,
            messages = listOf(
                ChatMessage("system", systemPrompt),
                ChatMessage("user", userPrompt),
            ),
        )
    }

    override fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage): String? {
        val dataUrl = "data:${image.mediaType};base64," +
            Base64.getEncoder().encodeToString(image.bytes)
        // Near-deterministic — the intended vision use is classification (photo orientation).
        return chat(
            model = visionModel,
            temperature = 0.1,
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

    private fun chat(model: String, temperature: Double, messages: List<ChatMessage>): String? {
        val key = apiKey.map { it.trim() }.orElse("")
        if (key.isBlank()) {
            log.debug("LLM api-key not configured — skipping external call, returning null.")
            return null
        }
        return try {
            api.chat("Bearer $key", ChatRequest(model = model, messages = messages, temperature = temperature))
                .choices.firstOrNull()?.message?.content?.trim()?.ifBlank { null }
        } catch (e: Exception) {
            log.error("Groq request failed", e)
            null
        }
    }
}
