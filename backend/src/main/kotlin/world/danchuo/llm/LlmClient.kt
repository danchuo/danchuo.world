package world.danchuo.llm

/**
 * Public API of the `llm` slice — an abstraction over an external LLM provider, mirroring the
 * proxemics `llm` module. v1 talks to Groq's OpenAI-compatible API; the provider can be swapped
 * (Anthropic, self-hosted) by replacing the implementation only — callers stay the same.
 *
 * Consumers are future slices (PRD backlog): the humorous board "search" widget (text) and
 * photo-drop orientation validation on upload (vision). This slice owns no domain logic —
 * callers build the prompts and interpret the replies.
 */
interface LlmClient {

    /**
     * Free-form text completion: the model's reply to [userPrompt] under [systemPrompt], or
     * `null` when no provider is configured (empty api-key) or the call fails. Callers must
     * treat `null` as "LLM unavailable" and degrade gracefully — never 500 a public endpoint.
     */
    fun completeText(systemPrompt: String, userPrompt: String): String?

    /**
     * The same completion, but explicitly on [lane] — see [LlmLane]. Only the routing client
     * ([ConfiguredLlmClient]) can honour a lane, since a lane may point at a different provider
     * than the primary one; a single-provider implementation ignores it and answers as usual.
     */
    fun completeText(systemPrompt: String, userPrompt: String, lane: LlmLane): String? =
        completeText(systemPrompt, userPrompt)

    /**
     * Vision completion: the model's reply to [userPrompt] about [image] under [systemPrompt],
     * or `null` under the same rules as [completeText]. Send downscaled variants (thumb/web) —
     * originals waste tokens without improving classification.
     */
    fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage): String?

    /**
     * Vision completion whose reply is constrained to [jsonSchema] (provider-native structured
     * output), returning raw JSON text under the same `null` rules as [completeVision].
     *
     * Providers that cannot constrain the reply fall back to a plain [completeVision] — callers
     * must parse defensively either way, since a schema-less model may wrap the JSON in prose or
     * run out of budget mid-object.
     */
    fun completeVisionJson(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
        jsonSchema: String,
    ): String? = completeVision(systemPrompt, userPrompt, image)
}

/**
 * Полоса вызовов: чьим лимитом (и чьими деньгами) оплачен поход к модели.
 *
 * Разведены они намеренно. Основная полоса — витринная: ответ нужен здесь и сейчас, в неё
 * настроена лучшая доступная модель, и она вправе быть платной. Фоновая работа, которая может
 * подождать такт поллера, обязана жить в бесплатной: пересказ прочитанного куска (PRD §5.16)
 * набегает по книге за книгой, и ставить его в один ряд с разовой проверкой поворота кадра
 * значило бы платить за то, что прекрасно делает free-лимит.
 *
 * Полоса — это провайдер + модель, а не просто модель: у бесплатной полосы вполне может быть
 * другой провайдер (Groq), чем у основной (Gemini). Разводит их [ConfiguredLlmClient].
 */
enum class LlmLane {
    /** Как настроено `danchuo.llm.provider`/`model` — может стоить денег. */
    PRIMARY,

    /** Только бесплатный лимит: `danchuo.llm.free-*`. Фоновая работа, ждать не жалко. */
    FREE,
}

/**
 * Внутренний шов слайса: провайдер, которому модель называют явно. Наружу его нет — он нужен
 * ровно затем, чтобы [ConfiguredLlmClient] мог послать бесплатную полосу в другую модель (и к
 * другому провайдеру), не заводя второго бина на каждую полосу.
 */
interface LlmTextProvider {

    fun completeText(systemPrompt: String, userPrompt: String, call: LlmTextCall): String?
}

/** Как звать модель на этот раз: чем считать и насколько вольно отвечать. */
data class LlmTextCall(
    val model: String,
    val temperature: Double,
    /**
     * Только для reasoning-моделей (`none` гасит «размышления вслух»). Пусто ⇒ параметр не
     * слать вовсе: модель, которая его не знает, отвергает ВЕСЬ запрос.
     */
    val reasoningEffort: String? = null,
)

/** An image passed to the model: raw bytes + IANA media type (e.g. `image/jpeg`). */
class LlmImage(
    val bytes: ByteArray,
    val mediaType: String,
)
