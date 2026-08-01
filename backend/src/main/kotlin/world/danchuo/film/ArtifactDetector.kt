package world.danchuo.film

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage

/** Артефакт глазами детектора: [hint] — описание для модели, [name] — как он зовётся в каталоге. */
data class DetectableArtifact(
    val id: Long,
    val name: String,
    val hint: String?,
) {
    /** Модели нужен вид, а не модельный номер: «YONEX ASTROX 10 4U» она искать не умеет. */
    val described: String get() = hint?.takeIf { it.isNotBlank() } ?: name
}

/** Рамка в долях кадра (0..1). Доли, а не пиксели: мозаика масштабирует кадры, thumb ≠ web. */
data class DetectedBox(
    val artifactId: Long,
    val x0: Double,
    val y0: Double,
    val x1: Double,
    val y1: Double,
)

/**
 * Итог проверки кадра. [Unavailable] — модель молчит или ответила невнятно; это **не** то же, что
 * [Found] с пустым списком. Смешать их — записать сбой провайдера в данные как «артефакта нет»
 * (та же беда, от которой защищён пустой прогон Health, см. PRD §5.4).
 */
sealed interface DetectionOutcome {
    data class Found(val boxes: List<DetectedBox>) : DetectionOutcome
    data object Unavailable : DetectionOutcome
}

/**
 * Ищет артефакты каталога на кадре фото-дропа одним обращением к модели: список предметов уезжает
 * в промт целиком, поэтому цена зависит от числа кадров, а не от числа артефактов.
 *
 * ⚠️ **Координаты.** Просим `[ymin, xmin, ymax, xmax]` в шкале 0..1000 — так их отдаёт Gemini
 * (y первым!). Разбор всё равно защитный: провайдер без структурного вывода может ответить
 * долями 0..1, выйти за пределы кадра или перепутать углы.
 */
@ApplicationScoped
class ArtifactDetector(
    private val llm: LlmClient,
) {

    private val log = Logger.getLogger(ArtifactDetector::class.java)
    private val mapper = ObjectMapper()

    fun detect(imageBytes: ByteArray, artifacts: List<DetectableArtifact>): DetectionOutcome {
        // Пустой каталог — не повод жечь вызов: ответ известен заранее.
        if (artifacts.isEmpty()) return DetectionOutcome.Found(emptyList())

        val reply = llm.completeVisionJson(
            systemPrompt = SYSTEM_PROMPT,
            userPrompt = userPrompt(artifacts),
            image = LlmImage(imageBytes, "image/jpeg"),
            jsonSchema = SCHEMA,
        ) ?: return DetectionOutcome.Unavailable

        val root = try {
            mapper.readTree(reply)
        } catch (e: Exception) {
            log.warn("Ответ детектора не разобран (обрыв/мусор) — кадр останется непроверенным", e)
            return DetectionOutcome.Unavailable
        }

        val byName = artifacts.associateBy { it.name.trim().lowercase() }
        val boxes = root.path("found").mapNotNull { node -> boxOf(node, byName) }
        return DetectionOutcome.Found(boxes)
    }

    private fun boxOf(node: JsonNode, byName: Map<String, DetectableArtifact>): DetectedBox? {
        // Имена задаёт БД: выдуманное моделью имя пропускаем молча, как незнакомую фазу сна.
        val artifact = byName[node.path("artifact").asText("").trim().lowercase()] ?: return null
        val raw = node.path("box_2d").takeIf { it.isArray && it.size() == 4 } ?: return null
        val values = (0..3).map { raw.get(it).asDouble(Double.NaN) }
        if (values.any { it.isNaN() }) return null

        // Шкала не объявлена в ответе: значения заметно больше единицы — это 0..1000.
        val scaled = if (values.any { it > SCALE_THRESHOLD }) values.map { it / 1000.0 } else values
        val (ymin, xmin, ymax, xmax) = scaled
        val x0 = clamp(xmin)
        val y0 = clamp(ymin)
        val x1 = clamp(xmax)
        val y1 = clamp(ymax)
        // Вырожденная или вывернутая рамка — мусор: подсветить ею нечего.
        if (x1 <= x0 || y1 <= y0) return null
        return DetectedBox(artifact.id, x0, y0, x1, y1)
    }

    private fun clamp(v: Double) = v.coerceIn(0.0, 1.0)

    private fun userPrompt(artifacts: List<DetectableArtifact>): String {
        val list = artifacts.joinToString("\n") { "- \"${it.name}\": ${it.described}" }
        return """
            |Look for these specific personal belongings in the photograph:
            |$list
            |
            |Report only the items you actually see. A similar but different object does not
            |count — a plain garment, or one with a different print, is not a match.
            |For each item you find, return its exact name from the list above in "artifact",
            |and box_2d as [ymin, xmin, ymax, xmax] normalised to 0-1000, tight around the item.
            |If you see none of them, return an empty list.
        """.trimMargin()
    }

    private companion object {
        const val SYSTEM_PROMPT =
            "You inspect scanned 35mm film photographs and locate specific personal belongings. " +
                "Answer with the JSON object only."

        /** Доли не бывают больше 1; всё заметно большее — шкала 0..1000. */
        const val SCALE_THRESHOLD = 1.5

        val SCHEMA = """
            {
              "type": "OBJECT",
              "properties": {
                "found": {
                  "type": "ARRAY",
                  "items": {
                    "type": "OBJECT",
                    "properties": {
                      "artifact": {"type": "STRING"},
                      "box_2d": {"type": "ARRAY", "items": {"type": "NUMBER"}}
                    },
                    "required": ["artifact", "box_2d"]
                  }
                }
              },
              "required": ["found"]
            }
        """.trimIndent()
    }
}
