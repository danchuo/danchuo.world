package world.danchuo.llm

import jakarta.annotation.PostConstruct
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger

/**
 * The one bean callers inject: picks the provider named by `danchuo.llm.provider` and forwards.
 *
 * The implementations are deliberately `@Typed` to their own class, so this is the only bean of
 * type [LlmClient] — otherwise every injection point would be an ambiguous resolution. Selection
 * is a runtime property rather than a build profile because the key, not the code, is what
 * changes when we move between providers.
 *
 * An unknown provider name falls back to Groq with a warning: a typo in an env var must not take
 * the site down, and the fallback is the historical default.
 */
@ApplicationScoped
class ConfiguredLlmClient(
    private val groq: GroqLlmClient,
    private val gemini: GeminiLlmClient,
    @param:ConfigProperty(name = "danchuo.llm.provider") private val provider: String,
) : LlmClient {

    private val log: Logger = Logger.getLogger(ConfiguredLlmClient::class.java)

    private val delegate: LlmClient
        get() = if (isGemini) gemini else groq

    private val isGemini: Boolean
        get() = provider.trim().equals(GEMINI, ignoreCase = true)

    @PostConstruct
    fun announce() {
        val name = provider.trim().lowercase()
        if (name != GEMINI && name != GROQ) {
            log.warn("Unknown danchuo.llm.provider='$provider' — falling back to '$GROQ'.")
        } else {
            log.info("LLM provider: $name")
        }
    }

    override fun completeText(systemPrompt: String, userPrompt: String): String? =
        delegate.completeText(systemPrompt, userPrompt)

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
    }
}
