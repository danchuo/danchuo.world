package world.danchuo.llm

/**
 * Public API of the `llm` slice: an abstraction over an external LLM provider, swappable by
 * replacing the implementation only. The slice owns no domain logic — callers build the
 * prompts and interpret the replies. PRD §9
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
     * Vision completion constrained to [jsonSchema], returning raw JSON under the `null` rules
     * of [completeVision]. A provider that cannot constrain the reply falls back to plain
     * [completeVision], so parse defensively: the JSON may arrive wrapped in prose or truncated.
     */
    fun completeVisionJson(
        systemPrompt: String,
        userPrompt: String,
        image: LlmImage,
        jsonSchema: String,
    ): String? = completeVision(systemPrompt, userPrompt, image)

    /**
     * Speech to text, `null` under the rules of [completeText]. Its quota is its own, measured
     * in audio seconds, so it takes no budget from text calls on the same lane. Send WINDOWS,
     * not whole files — both the lane and the summary cap size (`AudioWindows` in spotify).
     */
    fun transcribe(audio: LlmAudio, lane: LlmLane): String? = null
}

/**
 * Which quota (and whose money) pays for the call. Anything that can wait a poller tick MUST
 * use [FREE]: summaries accrue book after book, and billing them like a one-off check would
 * pay for what the free quota does fine. A lane is provider + model, not just a model.
 */
enum class LlmLane {
    /** As configured by `danchuo.llm.provider`/`model` — may cost money. */
    PRIMARY,

    /** Free quota only (`danchuo.llm.free-*`). Background work, waiting is fine. */
    FREE,
}

/**
 * Slice-internal seam: a provider told its model explicitly. It exists so [ConfiguredLlmClient]
 * can route the free lane to another model, and another provider, without a bean per lane.
 */
interface LlmTextProvider {

    fun completeText(systemPrompt: String, userPrompt: String, call: LlmTextCall): String?
}

/** How to call the model this time: what to count with, and how freely to answer. */
data class LlmTextCall(
    val model: String,
    val temperature: Double,
    /**
     * Reasoning models only (`none` silences thinking aloud). Empty means do not send the
     * parameter at all: a model that does not know it rejects the WHOLE request.
     */
    val reasoningEffort: String? = null,
)

/** An image passed to the model: raw bytes + IANA media type (e.g. `image/jpeg`). */
class LlmImage(
    val bytes: ByteArray,
    val mediaType: String,
)

/**
 * A chunk of audio to transcribe. The file name is load-bearing: providers read the format off
 * the extension in the multipart part and reject a nameless one. The bytes are a raw slice of
 * the stream, not a whole file, which is fine — mp3 resynchronises on the first frame header.
 */
class LlmAudio(
    val bytes: ByteArray,
    val mediaType: String,
    val fileName: String,
)
