package world.danchuo.social

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.llm.GroqLlmClient
import world.danchuo.llm.LlmImage
import java.nio.file.Path
import java.time.LocalDate

/**
 * Заведение артефактов из `/admin` (PRD §5.8): раньше каждый новый предмет был миграцией, то есть
 * правкой кода и деплоем.
 *
 * Подсказку для детектора ([Artifact.detectionHint]) предлагает **дешёвая модель** — описать
 * картинку словами умеет любая, платить за это координатной моделью незачем. Поэтому здесь
 * инъектируется [GroqLlmClient] напрямую, а не общий `LlmClient`: выбор провайдера тут часть
 * замысла, а не конфигурации. Модель молчит ⇒ `null`, поле заполняется руками.
 */
@ApplicationScoped
class ArtifactAdminService(
    private val artifacts: ArtifactRepository,
    private val images: ArtifactImageStorage,
    private val cheapLlm: GroqLlmClient,
) {

    private val log = Logger.getLogger(ArtifactAdminService::class.java)

    /** Тот же порядок, что и в ленте (хроника, старое первым) — список правится «как видно». */
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

    /** Принять загруженную картинку и привязать её URL к артефакту. */
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
     * Предложить описание предмета по его картинке — одной строкой, по-английски (промт детектора
     * тоже английский). `null` — модели нет или она не ответила: поле остаётся за человеком.
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
        // Модель любит обрамлять ответ кавычками и точкой — подсказке это не нужно.
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

/** Поля формы заведения артефакта. */
data class ArtifactInput(
    val name: String = "",
    val firstMentionedOn: String = "",
    val rotatable: Boolean = false,
    /** Как предмет выглядит — для поиска на кадрах (§5.12). Пусто ⇒ в ход идёт имя. */
    val detectionHint: String? = null,
) {
    val parsedDate: LocalDate
        get() = runCatching { LocalDate.parse(firstMentionedOn) }
            .getOrElse { throw IllegalArgumentException("invalid_date") }
}
