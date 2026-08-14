package world.danchuo.llm

import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Typed
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.util.Base64
import java.util.Optional

/**
 * [LlmClient] backed by Google's Gemini. Selected with `danchuo.llm.provider=gemini`.
 *
 * Follows the same degradation contract as [GroqLlmClient] — no api-key or a provider error
 * collapses to `null` and never propagates — and adds provider-native structured output, which
 * is why it exists: Groq's remaining vision model states coordinates unreliably and can spend its
 * whole budget "thinking" before emitting any JSON at all.
 */
@ApplicationScoped
@Typed(GeminiLlmClient::class)
class GeminiLlmClient(
    @param:RestClient private val api: GeminiApi,
    @param:ConfigProperty(name = "danchuo.gemini.api-key") private val apiKey: Optional<String>,
    @param:ConfigProperty(name = "danchuo.gemini.model") private val model: String,
    @param:ConfigProperty(name = "danchuo.gemini.vision-model") private val visionModel: String,
    private val mapper: ObjectMapper,
) : LlmClient, LlmTextProvider {

    private val log: Logger = Logger.getLogger(GeminiLlmClient::class.java)

    override fun completeText(systemPrompt: String, userPrompt: String): String? =
        generate(
            model = model,
            temperature = 0.7,
            systemPrompt = systemPrompt,
            parts = listOf(GeminiTextPart(userPrompt)),
        )

    /** Усилие рассуждения — понятие Groq; у Gemini его в запросе нет, поле просто не смотрим. */
    override fun completeText(systemPrompt: String, userPrompt: String, call: LlmTextCall): String? =
        generate(
            model = call.model,
            temperature = call.temperature,
            systemPrompt = systemPrompt,
            parts = listOf(GeminiTextPart(userPrompt)),
        )

    override fun completeVision(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
    ): String? = generate(
        model = visionModel,
        temperature = 0.0,
        systemPrompt = systemPrompt,
        parts = listOf(GeminiTextPart(userPrompt), imagePart(image)),
    )

    override fun completeVisionJson(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
        jsonSchema: String,
    ): String? {
        val schema = try {
            @Suppress("UNCHECKED_CAST")
            mapper.readValue(jsonSchema, Map::class.java) as Map<String, Any?>
        } catch (e: Exception) {
            log.error("Invalid JSON schema for Gemini structured output", e)
            return null
        }
        return generate(
            model = visionModel,
            temperature = 0.0,
            systemPrompt = systemPrompt,
            parts = listOf(GeminiTextPart(userPrompt), imagePart(image)),
            responseMimeType = "application/json",
            responseSchema = schema,
        )
    }

    private fun imagePart(image: LlmImage) = GeminiImagePart(
        GeminiInlineData(
            mimeType = image.mediaType,
            data = Base64.getEncoder().encodeToString(image.bytes),
        ),
    )

    private fun generate(
        model: String,
        temperature: Double,
        systemPrompt: String,
        parts: List<Any>,
        responseMimeType: String? = null,
        responseSchema: Map<String, Any?>? = null,
    ): String? {
        val key = apiKey.map { it.trim() }.orElse("")
        if (key.isBlank()) {
            log.debug("Gemini api-key not configured — skipping external call, returning null.")
            return null
        }
        return try {
            api.generate(
                apiKey = key,
                model = model,
                request = GeminiRequest(
                    contents = listOf(GeminiContent(parts)),
                    systemInstruction = GeminiContent(listOf(GeminiTextPart(systemPrompt))),
                    generationConfig = GeminiGenerationConfig(
                        temperature = temperature,
                        responseMimeType = responseMimeType,
                        responseSchema = responseSchema,
                    ),
                ),
            ).candidates.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()?.ifBlank { null }
        } catch (e: Exception) {
            log.error("Gemini request failed", e)
            null
        }
    }
}
