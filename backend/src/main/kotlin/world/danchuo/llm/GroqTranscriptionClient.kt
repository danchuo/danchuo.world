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
 * Расшифровка речи у Groq (`/openai/v1/audio/transcriptions`, PRD §5.16.1).
 *
 * Отдельный бин от [GroqLlmClient], потому что это другой протокол: не JSON, а
 * **multipart/form-data**. Тело собирается руками, и это сознательно — декларативный
 * multipart REST-клиента прячет ровно то, что здесь важнее всего: имя файла в части. Без
 * расширения в имени Groq отвергает запрос, а увидеть это можно только в проде, потому что
 * native-образ собирается уже после мержа (PR-сборка — только JVM).
 *
 * Контракт деградации общий для слайса: нет ключа или провайдер отказал ⇒ `null`, и вызывающий
 * молчит, а не роняет фон.
 *
 * **Лимит здесь свой.** Он меряется аудиосекундами (7200 в час на бесплатной полосе), а не
 * токенами в минуту, поэтому расшифровка и текстовый пересказ не отнимают бюджет друг у друга,
 * хотя ключ и провайдер у них общие.
 */
@ApplicationScoped
class GroqTranscriptionClient(
    @param:ConfigProperty(name = "danchuo.llm.api-key") private val apiKey: Optional<String>,
    @param:ConfigProperty(name = "danchuo.llm.transcribe-model") private val model: String,
    @param:ConfigProperty(name = "danchuo.llm.transcribe-url") private val url: String,
) {

    private val log: Logger = Logger.getLogger(GroqTranscriptionClient::class.java)

    /** Текст куска; `null` — ключа нет, провайдер отказал или ответ пуст. */
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
                    // Ответ просим текстом (`response_format=text`) — разбирать нечего, и это
                    // избавляет от JSON-DTO, который в native пришлось бы держать рефлексией.
                    it.readEntity(String::class.java)?.trim()?.ifBlank { null }
                }
            }
        } catch (e: Exception) {
            log.error("Groq transcription request failed", e)
            null
        }
    }

    /**
     * Тело multipart: файл плюс два поля. Собрано вручную и побайтно — текстовые части в UTF-8,
     * аудио как есть; склеивать их через `String` нельзя, звук не текст.
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
