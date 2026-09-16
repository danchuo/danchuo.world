package world.danchuo.llm

import jakarta.annotation.PostConstruct
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.util.Optional

/**
 * The one bean callers inject: it picks the provider named by `danchuo.llm.provider`, and an
 * unknown name warns and falls back to Groq rather than taking the site down. Lanes ([LlmLane])
 * are split here rather than by a bean each — a lane is only call arguments.
 */
@ApplicationScoped
class ConfiguredLlmClient(
    private val groq: GroqLlmClient,
    private val gemini: GeminiLlmClient,
    private val transcription: GroqTranscriptionClient,
    @param:ConfigProperty(name = "danchuo.llm.provider") private val provider: String,
    @param:ConfigProperty(name = "danchuo.llm.free-provider") private val freeProvider: String,
    @param:ConfigProperty(name = "danchuo.llm.free-model") private val freeModel: String,
    @param:ConfigProperty(name = "danchuo.llm.free-reasoning-effort")
    private val freeReasoningEffort: Optional<String>,
) : LlmClient {

    private val log: Logger = Logger.getLogger(ConfiguredLlmClient::class.java)

    private val delegate: LlmClient
        get() = if (isGemini) gemini else groq

    private val isGemini: Boolean
        get() = provider.trim().equals(GEMINI, ignoreCase = true)

    /** The free lane picks its provider by its own property; it need not match the primary. */
    private val freeDelegate: LlmTextProvider
        get() = if (freeProvider.trim().equals(GEMINI, ignoreCase = true)) gemini else groq

    @PostConstruct
    fun announce() {
        val name = provider.trim().lowercase()
        if (name != GEMINI && name != GROQ) {
            log.warn("Unknown danchuo.llm.provider='$provider' — falling back to '$GROQ'.")
        } else {
            log.info("LLM provider: $name (free lane: ${freeProvider.trim().lowercase()}/$freeModel)")
        }
    }

    override fun completeText(systemPrompt: String, userPrompt: String): String? =
        delegate.completeText(systemPrompt, userPrompt)

    /**
     * The lane picks provider and model ([LlmLane]), and the free one also its own temperature:
     * its work is factual, and the primary lane's warmer setting makes the model invent what
     * the excerpt never said.
     */
    override fun completeText(systemPrompt: String, userPrompt: String, lane: LlmLane): String? =
        when (lane) {
            LlmLane.PRIMARY -> completeText(systemPrompt, userPrompt)
            LlmLane.FREE -> freeDelegate.completeText(
                systemPrompt,
                userPrompt,
                LlmTextCall(
                    model = freeModel,
                    temperature = FREE_TEMPERATURE,
                    reasoningEffort = freeReasoningEffort.map { it.trim() }.filter { it.isNotEmpty() }
                        .orElse(null),
                ),
            )
        }

    /**
     * Transcription always goes to Groq whatever the lane: Gemini has none in our contract, and
     * Groq's free audio-second quota is far above what the background needs. The lane stays in
     * the signature so the caller still names the cost out loud.
     */
    override fun transcribe(audio: LlmAudio, lane: LlmLane): String? = transcription.transcribe(audio)

    override fun completeVision(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
    ): String? = delegate.completeVision(systemPrompt, userPrompt, image)

    override fun completeVisionJson(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
        jsonSchema: String,
    ): String? = delegate.completeVisionJson(systemPrompt, userPrompt, image, jsonSchema)

    private companion object {
        const val GROQ = "groq"
        const val GEMINI = "gemini"

        /** The background lane retells the text; it does not invent on top of it. */
        const val FREE_TEMPERATURE = 0.3
    }
}
