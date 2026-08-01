package world.danchuo.llm

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Groq exposes an OpenAI-compatible chat-completions endpoint at /openai/v1 (same wire shape as
 * in proxemics, extended with image content parts for vision models).
 * Base URL is configured via `quarkus.rest-client.groq.url`.
 */
@RegisterRestClient(configKey = "groq")
interface GroqApi {

    @POST
    @Path("/openai/v1/chat/completions")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    fun chat(
        @HeaderParam("Authorization") authorization: String,
        request: ChatRequest,
    ): ChatResponse
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ChatRequest(
    val model: String,
    val messages: List<ChatMessage>,
    val temperature: Double,
    /**
     * Гасит «размышления вслух» у reasoning-моделей (`none`). Для qwen3.6 это обязательно:
     * иначе она тратит весь лимит ответа на `<think>` и обрывается, не дойдя до полезной части —
     * снаружи это выглядит как «модель не смогла», а не как обрезанный ответ. Заодно вдвое
     * дешевле. Модели, не знающие параметра, отвергают запрос — поэтому он выключаем конфигом.
     */
    @get:JsonProperty("reasoning_effort") val reasoningEffort: String? = null,
)

/**
 * OpenAI-compatible message: [content] is either a plain `String` (text-only) or a
 * `List` of [TextPart]/[ImagePart] (multimodal). Jackson serializes by runtime type.
 */
data class ChatMessage(
    val role: String,
    val content: Any,
)

/*
 * Content parts are reached through the `Any`-typed field above, so Quarkus can't discover them
 * from the REST-client signature — @RegisterForReflection keeps them alive in native image.
 */

@RegisterForReflection
data class TextPart(
    val text: String,
) {
    val type: String = "text"
}

@RegisterForReflection
data class ImagePart(
    @get:JsonProperty("image_url") val imageUrl: ImageUrl,
) {
    val type: String = "image_url"
}

/** OpenAI vision carries the image as a data URL: `data:{mediaType};base64,{payload}`. */
@RegisterForReflection
data class ImageUrl(
    val url: String,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ChatResponse(
    val choices: List<Choice> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class Choice(
    val message: ResponseMessage = ResponseMessage(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ResponseMessage(
    val role: String = "",
    val content: String = "",
)
