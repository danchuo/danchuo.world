package world.danchuo.film

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage

/**
 * Units for parsing the model's reply; [FakeLlm] replays recorded answers, so no key is spent.
 * Pinned here: "checked, found nothing" and "the provider did not answer" are DIFFERENT outcomes —
 * merging them would record a Gemini failure as "no artifact on the frame".
 */
class ArtifactDetectorTest {

    private val tee = DetectableArtifact(1L, "Белая футболка", "white T-shirt with a red print")
    private val racket = DetectableArtifact(2L, "YONEX ASTROX 10", "white and pink badminton racket")
    private val artifacts = listOf(tee, racket)

    private class FakeLlm(private val reply: String?) : LlmClient {
        var lastPrompt: String? = null
        var lastSchema: String? = null

        override fun completeText(systemPrompt: String, userPrompt: String) = reply

        override fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage) =
            reply

        override fun completeVisionJson(
            systemPrompt: String,
            userPrompt: String,
            image: LlmImage,
            jsonSchema: String,
        ): String? {
            lastPrompt = userPrompt
            lastSchema = jsonSchema
            return reply
        }
    }

    private fun detect(reply: String?, list: List<DetectableArtifact> = artifacts) =
        ArtifactDetector(FakeLlm(reply)).detect(byteArrayOf(1, 2, 3), list)

    @Test
    fun `converts Gemini coordinates from y-first 0-1000 into x-first fractions`() {
        // [ymin, xmin, ymax, xmax] — y comes first, scale 0..1000
        val found = detect("""{"found":[{"artifact":"Белая футболка","box_2d":[250,100,750,600]}]}""")
        val boxes = assertInstanceOf(DetectionOutcome.Found::class.java, found).boxes
        assertEquals(1, boxes.size)
        val b = boxes.single()
        assertEquals(1L, b.artifactId)
        assertEquals(0.100, b.x0, 1e-9)
        assertEquals(0.250, b.y0, 1e-9)
        assertEquals(0.600, b.x1, 1e-9)
        assertEquals(0.750, b.y1, 1e-9)
    }

    @Test
    fun `accepts a provider that already answers in fractions`() {
        val found = detect("""{"found":[{"artifact":"Белая футболка","box_2d":[0.2,0.1,0.8,0.5]}]}""")
        val b = assertInstanceOf(DetectionOutcome.Found::class.java, found).boxes.single()
        assertEquals(0.1, b.x0, 1e-9)
        assertEquals(0.2, b.y0, 1e-9)
    }

    @Test
    fun `empty list means checked and nothing found`() {
        val outcome = detect("""{"found":[]}""")
        assertEquals(emptyList<DetectedBox>(), assertInstanceOf(DetectionOutcome.Found::class.java, outcome).boxes)
    }

    @Test
    fun `silent provider is unavailable, not an empty result`() {
        assertInstanceOf(DetectionOutcome.Unavailable::class.java, detect(null))
    }

    @Test
    fun `unparseable reply is unavailable, not an empty result`() {
        // A model without structured output can stop mid-word: that is a failure, not "empty".
        assertInstanceOf(DetectionOutcome.Unavailable::class.java, detect("""{"found":[{"artif"""))
    }

    @Test
    fun `unknown artifact name is skipped silently`() {
        // Names come from the DB; a name the model invented must not sink the whole frame.
        val outcome = detect(
            """{"found":[{"artifact":"Ничего подобного","box_2d":[1,1,9,9]},
               {"artifact":"YONEX ASTROX 10","box_2d":[100,100,900,900]}]}""",
        )
        val boxes = assertInstanceOf(DetectionOutcome.Found::class.java, outcome).boxes
        assertEquals(listOf(2L), boxes.map { it.artifactId })
    }

    @Test
    fun `degenerate and inverted boxes are dropped`() {
        val outcome = detect(
            """{"found":[{"artifact":"Белая футболка","box_2d":[500,500,500,500]},
               {"artifact":"YONEX ASTROX 10","box_2d":[900,900,100,100]}]}""",
        )
        assertEquals(emptyList<DetectedBox>(), assertInstanceOf(DetectionOutcome.Found::class.java, outcome).boxes)
    }

    @Test
    fun `coordinates outside the frame are clamped`() {
        val outcome = detect("""{"found":[{"artifact":"Белая футболка","box_2d":[-50,-20,1200,1400]}]}""")
        val b = assertInstanceOf(DetectionOutcome.Found::class.java, outcome).boxes.single()
        assertEquals(0.0, b.x0, 1e-9)
        assertEquals(0.0, b.y0, 1e-9)
        assertEquals(1.0, b.x1, 1e-9)
        assertEquals(1.0, b.y1, 1e-9)
    }

    @Test
    fun `prompt names every artifact and prefers its hint over the catalogue name`() {
        val llm = FakeLlm("""{"found":[]}""")
        ArtifactDetector(llm).detect(byteArrayOf(1), artifacts)
        val prompt = llm.lastPrompt!!
        assertTrue(prompt.contains("white T-shirt with a red print")) { "hint in prompt: $prompt" }
        assertTrue(prompt.contains("white and pink badminton racket")) { "hint in prompt: $prompt" }
        assertTrue(prompt.contains("Белая футболка")) { "name in prompt: $prompt" }
        assertTrue(llm.lastSchema!!.contains("box_2d")) { "schema asks for boxes: ${llm.lastSchema}" }
    }

    @Test
    fun `no artifacts to look for means no call at all`() {
        val llm = FakeLlm("""{"found":[{"artifact":"Белая футболка","box_2d":[1,1,9,9]}]}""")
        val outcome = ArtifactDetector(llm).detect(byteArrayOf(1), emptyList())
        assertEquals(emptyList<DetectedBox>(), assertInstanceOf(DetectionOutcome.Found::class.java, outcome).boxes)
        assertEquals(null, llm.lastPrompt) { "не должно быть обращения к модели" }
    }
}
