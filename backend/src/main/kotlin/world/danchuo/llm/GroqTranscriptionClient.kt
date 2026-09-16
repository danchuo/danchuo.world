package world.danchuo.llm

import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.client.ClientBuilder
import jakarta.ws.rs.client.Entity
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.util.Optional
import java.util.concurrent.ThreadLocalRandom

/**
 * Speech transcription on Groq. A separate bean from [GroqLlmClient] because the protocol differs:
 * multipart, with the body assembled BY HAND — the declarative client hides the part's filename,
 * and Groq rejects one without an extension (docs/pitfalls.md). Its own limit: PRD §5.16.1
 */
@ApplicationScoped
class GroqTranscriptionClient(
    @param:ConfigProperty(name = "danchuo.llm.api-key") private val apiKey: Optional<String>,
    @param:ConfigProperty(name = "danchuo.llm.transcribe-model") private val model: String,
    @param:ConfigProperty(name = "danchuo.llm.transcribe-url") private val url: String,
) {

    private val log: Logger = Logger.getLogger(GroqTranscriptionClient::class.java)

    /** The chunk's text; `null` when there is no key, the provider refused, or the reply is empty. */
    fun transcribe(audio: LlmAudio): String? {
        val key = apiKey.map { it.trim() }.orElse("")
        if (key.isBlank()) {
            log.debug("LLM api-key not configured — skipping transcription, returning null.")
            return null
        }

        val boundary = "danchuo" + java.lang.Long.toHexString(ThreadLocalRandom.current().nextLong())
        val body = multipart(boundary, audio)

        return try {
            ClientBuilder.newClient().use { client ->
                val response = client.target(url)
                    .request(MediaType.APPLICATION_JSON_TYPE)
                    .header("Authorization", "Bearer $key")
                    .post(Entity.entity(body, "multipart/form-data; boundary=$boundary"))

                response.use {
                    if (it.status !in 200..299) {
                        log.warnf("Groq transcription failed: HTTP %d", it.status)
                        return null
                    }
                    // We ask for a plain-text reply (`response_format=text`): nothing to parse,
                    // and it spares a JSON DTO that native would need reflection for.
                    it.readEntity(String::class.java)?.trim()?.ifBlank { null }
                }
            }
        } catch (e: Exception) {
            log.error("Groq transcription request failed", e)
            null
        }
    }

    /**
     * The multipart body: a file plus two fields, assembled by hand and byte-wise — text parts in
     * UTF-8, audio as is. They must not be glued through a `String`; sound is not text.
     */
    private fun multipart(boundary: String, audio: LlmAudio): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        fun text(value: String) = out.write(value.toByteArray(Charsets.UTF_8))

        text("--$boundary\r\n")
        text("Content-Disposition: form-data; name=\"file\"; filename=\"${audio.fileName}\"\r\n")
        text("Content-Type: ${audio.mediaType}\r\n\r\n")
        out.write(audio.bytes)
        text("\r\n")

        for ((name, value) in listOf("model" to model, "response_format" to "text")) {
            text("--$boundary\r\n")
            text("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
            text(value)
            text("\r\n")
        }
        text("--$boundary--\r\n")
        return out.toByteArray()
    }
}
