package world.danchuo.social

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.llm.GroqLlmClient
import world.danchuo.llm.LlmImage
import java.nio.file.Path
import java.time.LocalDate

/**
 * Creating artifacts from `/admin`. The detector hint ([Artifact.detectionHint]) is proposed by a
 * CHEAP model — describing a picture in words needs no coordinate model — so [GroqLlmClient] is
 * injected directly rather than the shared `LlmClient`. Silence gives `null` and a manual field.
 */
@ApplicationScoped
class ArtifactAdminService(
    private val artifacts: ArtifactRepository,
    private val images: ArtifactImageStorage,
    private val cheapLlm: GroqLlmClient,
) {

    private val log = Logger.getLogger(ArtifactAdminService::class.java)

    /** The same order as the marquee (chronicle, oldest first) — the list is edited as seen. */
    fun list(): List<AdminArtifactView> = artifacts.listOrdered().map(::view)

    fun create(input: ArtifactInput): AdminArtifactView = tx {
        val a = Artifact().apply {
            name = input.name.trim()
            firstMentionedOn = input.parsedDate
            rotatable = input.rotatable
            detectionHint = input.detectionHint?.trim()?.ifBlank { null }
            imageUrl = null
        }
        require(a.name.isNotEmpty()) { "name_required" }
        artifacts.persist(a)
        view(a)
    }

    fun update(id: Long, input: ArtifactInput): AdminArtifactView? = tx {
        val a = artifacts.findById(id) ?: return@tx null
        a.name = input.name.trim().ifEmpty { a.name }
        a.firstMentionedOn = input.parsedDate
        a.rotatable = input.rotatable
        a.detectionHint = input.detectionHint?.trim()?.ifBlank { null }
        view(a)
    }

    fun delete(id: Long): Boolean = tx {
        val a = artifacts.findById(id) ?: return@tx false
        artifacts.delete(a)
        images.delete(id)
        true
    }

    /** Accepts an uploaded picture and binds its URL to the artifact. */
    fun putImage(id: Long, file: Path): AdminArtifactView? {
        artifacts.findById(id) ?: return null
        images.putFile(id, file)
        return tx {
            artifacts.findById(id)?.let { a ->
                a.imageUrl = images.urlOf(id)
                view(a)
            }
        }
    }

    /**
     * Suggests an item description from its picture — one line, in English (the detector prompt is
     * English too). `null` when there is no model or it did not answer: the field stays a human's.
     */
    fun suggestHint(id: Long): String? {
        val bytes = images.get(id) ?: run {
            log.debug("Нет картинки артефакта $id — описывать нечего")
            return null
        }
        val reply = cheapLlm.completeVision(
            systemPrompt = "You describe objects for a visual search system. " +
                "Answer with the description only — no preamble, no quotes, one line.",
            userPrompt = "Describe this object in one short English phrase, the way it would look " +
                "in a photograph: colour, material and kind. Example: " +
                "\"a white and pink badminton racket\". Do not name a brand or model.",
            image = LlmImage(bytes, "image/png"),
        ) ?: return null
        // The model likes to wrap its answer in quotes and a full stop — the hint needs neither.
        return reply.lines().firstOrNull { it.isNotBlank() }
            ?.trim()?.trim('"', '.', ' ')?.ifBlank { null }
    }

    private fun view(a: Artifact) = AdminArtifactView(
        id = a.id!!,
        name = a.name,
        imageUrl = a.imageUrl,
        firstMentionedOn = a.firstMentionedOn.toString(),
        rotatable = a.rotatable,
        detectionHint = a.detectionHint,
    )

    private fun <T> tx(block: () -> T): T = QuarkusTransaction.requiringNew().call(block)
}

/** Form fields for creating an artifact. */
data class ArtifactInput(
    val name: String = "",
    val firstMentionedOn: String = "",
    val rotatable: Boolean = false,
    /** What the item looks like, for finding it on frames (§5.12). Empty falls back to the name. */
    val detectionHint: String? = null,
) {
    val parsedDate: LocalDate
        get() = runCatching { LocalDate.parse(firstMentionedOn) }
            .getOrElse { throw IllegalArgumentException("invalid_date") }
}
