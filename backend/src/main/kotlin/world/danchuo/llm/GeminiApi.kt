package world.danchuo.llm

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Google's Generative Language API. Unlike the OpenAI-compatible shape used by Groq, the model is
 * part of the path and is separated from the verb by a colon, and the key travels in a header
 * rather than as a bearer token. Base URL is configured via `quarkus.rest-client.gemini.url`.
 */
@RegisterRestClient(configKey = "gemini")
interface GeminiApi {

    @POST
    @Path("/v1beta/models/{model}:generateContent")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    fun generate(
        @HeaderParam("x-goog-api-key") apiKey: String,
        @PathParam("model") model: String,
        request: GeminiRequest,
    ): GeminiResponse
}

/**
 * Nulls must be omitted, not serialized: the API rejects a payload that names a field it does not
 * expect for the call (a `null` generationConfig is not the same as an absent one).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class GeminiRequest(
    val contents: List<GeminiContent>,
    @get:JsonProperty("systemInstruction") val systemInstruction: GeminiContent? = null,
    @get:JsonProperty("generationConfig") val generationConfig: GeminiGenerationConfig? = null,
)

/** [parts] holds [GeminiTextPart]/[GeminiImagePart]; Jackson serializes by runtime type. */
data class GeminiContent(
    val parts: List<Any>,
)

/*
 * Parts are reached through the `Any`-typed list above, so Quarkus can't discover them from the
 * REST-client signature — @RegisterForReflection keeps them alive in native image.
 */

@RegisterForReflection
data class GeminiTextPart(
    val text: String,
)

@RegisterForReflection
data class GeminiImagePart(
    @get:JsonProperty("inline_data") val inlineData: GeminiInlineData,
)

/** Gemini takes image bytes inline as base64 — no data-URL prefix, unlike the OpenAI shape. */
@RegisterForReflection
data class GeminiInlineData(
    @get:JsonProperty("mime_type") val mimeType: String,
    val data: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@RegisterForReflection
data class GeminiGenerationConfig(
    val temperature: Double,
    @get:JsonProperty("responseMimeType") val responseMimeType: String? = null,
    /** Parsed schema object; sending it as a string would be rejected. */
    @get:JsonProperty("responseSchema") val responseSchema: Map<String, Any?>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeminiResponse(
    val candidates: List<GeminiCandidate> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeminiCandidate(
    val content: GeminiResponseContent = GeminiResponseContent(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeminiResponseContent(
    val parts: List<GeminiResponsePart> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeminiResponsePart(
    val text: String = "",
)
