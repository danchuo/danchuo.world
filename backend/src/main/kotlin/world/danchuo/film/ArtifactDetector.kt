package world.danchuo.film

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage

/** An artifact as the detector sees it: [hint] describes it to the model, [name] is its catalogue name. */
data class DetectableArtifact(
    val id: Long,
    val name: String,
    val hint: String?,
) {
    /** The model needs an appearance, not a model number: it cannot search for a part code. */
    val described: String get() = hint?.takeIf { it.isNotBlank() } ?: name
}

/** A box in frame fractions (0..1). Fractions, not pixels: the mosaic scales frames, thumb != web. */
data class DetectedBox(
    val artifactId: Long,
    val x0: Double,
    val y0: Double,
    val x1: Double,
    val y1: Double,
)

/**
 * Result of checking one frame. [Unavailable] means the model was silent or incoherent, which is
 * NOT the same as [Found] with an empty list. Merging them would record a provider outage as "no
 * artifact here" — the same trap an empty Health run is guarded against (PRD §5.4).
 */
sealed interface DetectionOutcome {
    data class Found(val boxes: List<DetectedBox>) : DetectionOutcome
    data object Unavailable : DetectionOutcome
}

/**
 * Finds catalogue artifacts on one frame in a single model call: the item list goes into the
 * prompt whole, so cost scales with the number of frames, not artifacts. Coordinates are asked as
 * `[ymin, xmin, ymax, xmax]` on a 0..1000 scale (y FIRST) and parsed defensively. PRD §5.12
 */
@ApplicationScoped
class ArtifactDetector(
    private val llm: LlmClient,
) {

    private val log = Logger.getLogger(ArtifactDetector::class.java)
    private val mapper = ObjectMapper()

    fun detect(imageBytes: ByteArray, artifacts: List<DetectableArtifact>): DetectionOutcome {
        // An empty catalogue is no reason to burn a call: the answer is known in advance.
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
        // Names come from the DB: a name the model invented is dropped silently.
        val artifact = byName[node.path("artifact").asText("").trim().lowercase()] ?: return null
        val raw = node.path("box_2d").takeIf { it.isArray && it.size() == 4 } ?: return null
        val values = (0..3).map { raw.get(it).asDouble(Double.NaN) }
        if (values.any { it.isNaN() }) return null

        // The scale is not declared in the reply: values well above one mean it is 0..1000.
        val scaled = if (values.any { it > SCALE_THRESHOLD }) values.map { it / 1000.0 } else values
        val (ymin, xmin, ymax, xmax) = scaled
        val x0 = clamp(xmin)
        val y0 = clamp(ymin)
        val x1 = clamp(xmax)
        val y1 = clamp(ymax)
        // A degenerate or inverted box is junk: there is nothing to highlight with it.
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

        /** Fractions never exceed 1; anything well above that is the 0..1000 scale. */
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
