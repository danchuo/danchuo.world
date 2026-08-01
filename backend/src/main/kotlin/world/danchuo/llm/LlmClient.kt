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

/** An image passed to the model: raw bytes + IANA media type (e.g. `image/jpeg`). */
class LlmImage(
    val bytes: ByteArray,
    val mediaType: String,
)
