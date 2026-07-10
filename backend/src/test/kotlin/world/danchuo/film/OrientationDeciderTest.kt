package world.danchuo.film

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * Юниты алгоритма определения ориентации (B9). Вместо сети — фейковый [LlmClient], который
 * «видит» картинку по-настоящему: декодирует JPEG и отвечает YES, когда красная полоса-маркер
 * сверху (= кадр «стоит правильно»). Так проверяется и геометрия поворотов [FilmImaging.rotate],
 * и логика решения, включая симуляцию замеренной слабости модели (ложный YES на «вверх ногами»).
 */
class OrientationDeciderTest {

    private enum class Edge { TOP, RIGHT, BOTTOM, LEFT }

    /** Фейк-модель: верификатор по положению красного края; управляемые режимы деградации. */
    private class EdgeLlm(
        /** Симуляция слабости из фазы 0: на перевёрнутом варианте тоже отвечает YES. */
        var confusedBy180: Boolean = false,
        /** Тай-брейк сломан: «перевёрнуто? — YES» про любой вариант. */
        var tieBreakBroken: Boolean = false,
        var available: Boolean = true,
    ) : LlmClient {
        var visionCalls = 0

        override fun completeText(systemPrompt: String, userPrompt: String): String? = null

        override fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage): String? {
            if (!available) return null
            visionCalls++
            val edge = redEdge(image.bytes)
            val tieBreak = userPrompt.contains("upside down", ignoreCase = true)
            return if (tieBreak) {
                if (tieBreakBroken || edge == Edge.BOTTOM) "YES" else "NO"
            } else {
                when {
                    edge == Edge.TOP -> "YES"
                    edge == Edge.BOTTOM && confusedBy180 -> "YES"
                    else -> "NO"
                }
            }
        }
    }

    private val imaging = FilmImaging(webMaxPx = 1600, thumbMaxPx = 400, jpegQuality = 0.9f)

    private fun decider(llm: LlmClient) = OrientationDecider(imaging, llm, throttleMs = 0)

    @Test
    fun `upright frame is kept after a single gate call`() {
        val llm = EdgeLlm()
        assertEquals(OrientationDecision.Upright, decider(llm).decide(jpeg(Edge.TOP)))
        assertEquals(1, llm.visionCalls)
    }

    @Test
    fun `sideways frames get the rotation that puts the marker back on top`() {
        // Red edge on the right = the scene's top points right = fix by rotating CCW.
        assertEquals(
            OrientationDecision.Rotate(FrameRotation.CCW90),
            decider(EdgeLlm()).decide(jpeg(Edge.RIGHT)),
        )
        assertEquals(
            OrientationDecision.Rotate(FrameRotation.CW90),
            decider(EdgeLlm()).decide(jpeg(Edge.LEFT)),
        )
    }

    @Test
    fun `upside-down frame is fixed with a 180 turn`() {
        assertEquals(
            OrientationDecision.Rotate(FrameRotation.R180),
            decider(EdgeLlm()).decide(jpeg(Edge.BOTTOM)),
        )
    }

    @Test
    fun `false YES on the upside-down candidate is resolved by the tie-break`() {
        // Sideways frame; the verifier also blesses the upside-down candidate (measured weakness).
        assertEquals(
            OrientationDecision.Rotate(FrameRotation.CCW90),
            decider(EdgeLlm(confusedBy180 = true)).decide(jpeg(Edge.RIGHT)),
        )
    }

    @Test
    fun `unresolvable ambiguity leaves the frame untouched`() {
        val llm = EdgeLlm(confusedBy180 = true, tieBreakBroken = true)
        assertEquals(OrientationDecision.Ambiguous, decider(llm).decide(jpeg(Edge.RIGHT)))
    }

    @Test
    fun `no confirmed candidate at all is ambiguous, not a guess`() {
        // Verifier says NO to everything (marker never lands on top: impossible edge answers).
        val llm = object : LlmClient {
            override fun completeText(systemPrompt: String, userPrompt: String): String? = null
            override fun completeVision(systemPrompt: String, userPrompt: String, image: LlmImage) = "NO"
        }
        assertEquals(OrientationDecision.Ambiguous, decider(llm).decide(jpeg(Edge.RIGHT)))
    }

    @Test
    fun `silent llm makes the frame retryable instead of guessed`() {
        val llm = EdgeLlm(available = false)
        assertEquals(OrientationDecision.Unavailable, decider(llm).decide(jpeg(Edge.RIGHT)))
        assertEquals(0, llm.visionCalls)
    }

    @Test
    fun `rotate swaps dimensions for quarter turns and keeps them for 180`() {
        val src = jpeg(Edge.TOP) // 40x20
        val cw = ImageIO.read(ByteArrayInputStream(imaging.rotate(src, FrameRotation.CW90)!!))
        assertEquals(20 to 40, cw.width to cw.height)
        val flipped = ImageIO.read(ByteArrayInputStream(imaging.rotate(src, FrameRotation.R180)!!))
        assertEquals(40 to 20, flipped.width to flipped.height)
    }

    // ── Маркерные картинки ──

    /** JPEG 40×20: синий фон, красная полоса на [edge] — маркер «где верх сцены». */
    private fun jpeg(edge: Edge): ByteArray {
        val img = BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.color = Color.BLUE
        g.fillRect(0, 0, 40, 20)
        g.color = Color.RED
        when (edge) {
            Edge.TOP -> g.fillRect(0, 0, 40, 4)
            Edge.BOTTOM -> g.fillRect(0, 16, 40, 4)
            Edge.LEFT -> g.fillRect(0, 0, 4, 20)
            Edge.RIGHT -> g.fillRect(36, 0, 4, 20)
        }
        g.dispose()
        val baos = ByteArrayOutputStream()
        ImageIO.write(img, "jpeg", baos)
        return baos.toByteArray()
    }

    private companion object {
        /** Какой край картинки самый красный (устойчиво к JPEG-артефактам — берётся максимум). */
        fun redEdge(bytes: ByteArray): Edge {
            val img = ImageIO.read(ByteArrayInputStream(bytes))
            fun redness(xs: IntRange, ys: IntRange): Int = xs.sumOf { x ->
                ys.sumOf { y ->
                    val c = Color(img.getRGB(x, y))
                    c.red - (c.green + c.blue) / 2
                }
            }
            val strip = 3
            return listOf(
                Edge.TOP to redness(0 until img.width, 0 until strip),
                Edge.BOTTOM to redness(0 until img.width, img.height - strip until img.height),
                Edge.LEFT to redness(0 until strip, 0 until img.height),
                Edge.RIGHT to redness(img.width - strip until img.width, 0 until img.height),
            ).maxBy { it.second }.first
        }
    }
}
