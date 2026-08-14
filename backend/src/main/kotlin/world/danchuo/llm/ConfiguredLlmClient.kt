package world.danchuo.llm

import jakarta.annotation.PostConstruct
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.util.Optional

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
 *
 * Это же единственное место, где разведены **полосы** ([LlmLane]): основная идёт в настроенного
 * провайдера, бесплатная — в своего, названного отдельными свойствами `danchuo.llm.free-*`.
 * Полосы разведены здесь, а не парой бинов на каждую, потому что различие между ними — это
 * ровно провайдер + модель + температура, то есть аргументы вызова, а не другое поведение.
 */
@ApplicationScoped
class ConfiguredLlmClient(
    private val groq: GroqLlmClient,
    private val gemini: GeminiLlmClient,
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

    /** Провайдер бесплатной полосы выбирается своим свойством: он не обязан совпадать с основным. */
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
     * Полоса выбирает провайдера и модель ([LlmLane]). У бесплатной ещё и своя температура:
     * работа в ней фактическая (пересказ по тексту книги), а тёплые 0.7 основной полосы там
     * только вредят — модель начинает досочинять то, чего в выдержке не было.
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

        /** Фактическая работа фоновой полосы: пересказывать текст, а не сочинять поверх него. */
        const val FREE_TEMPERATURE = 0.3
    }
}
