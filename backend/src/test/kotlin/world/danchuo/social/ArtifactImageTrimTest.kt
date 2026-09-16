package world.danchuo.social

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * Trimming transparent margins off an artifact image (PRD §5.8). The marquee (DESIGN §7.2) sizes
 * items by optical weight taken from the CANVAS proportion, so wide transparent margins shrink
 * the item by exactly the margin's factor — 30% canvas coverage read as square instead of 2.82.
 */
class ArtifactImageTrimTest {

    @Test
    fun `crops transparent margins down to the object`() {
        // A 20x10 item in the middle of a 100x100 canvas — the sunglasses case from production.
        val png = pngOf(100, 100) { g -> g.color = Color.RED; g.fillRect(40, 45, 20, 10) }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(20, out.width)
        assertEquals(10, out.height)
    }

    @Test
    fun `keeps a fully opaque image as is`() {
        // An opaque canvas (a photo, say): nothing to trim, the item already fills the frame.
        val png = pngOf(60, 40, opaque = true) { g -> g.color = Color.BLUE; g.fillRect(0, 0, 60, 40) }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(60, out.width)
        assertEquals(40, out.height)
    }

    @Test
    fun `leaves a fully transparent image alone instead of producing nothing`() {
        // An empty picture is the degenerate case: trimming would give 0x0, which is not a picture.
        val png = pngOf(30, 30) { }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(30, out.width)
        assertEquals(30, out.height)
    }

    @Test
    fun `returns unreadable bytes untouched instead of losing the upload`() {
        // Quiet degradation: what we cannot parse we return as is. Losing the owner's upload is
        // worse than keeping it untrimmed.
        val junk = byteArrayOf(1, 2, 3, 4, 5)

        assertArrayEquals(junk, ArtifactImageTrim.trim(junk))
    }

    @Test
    fun `normalises other formats to png`() {
        // Serving labels the picture image/png whatever was uploaded, so we convert on the way
        // in — otherwise a JPEG travels under a foreign content type.
        val jpeg = ByteArrayOutputStream().also { out ->
            val img = BufferedImage(50, 20, BufferedImage.TYPE_INT_RGB)
            img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, 50, 20); dispose() }
            ImageIO.write(img, "jpg", out)
        }.toByteArray()

        val out = ArtifactImageTrim.trim(jpeg)

        // The PNG signature: 89 50 4E 47.
        assertTrue(out.size > 4 && out[0] == 0x89.toByte() && out[1] == 'P'.code.toByte())
        assertEquals(50, ImageIO.read(out.inputStream()).width)
    }

    @Test
    fun `invisible alpha haze over the canvas does not defeat the crop`() {
        // Found in production: a background remover left alpha 1..8 across the whole canvas
        // (invisible to the eye). Under a strict "alpha > 0" the opaque bounds covered everything,
        // trimming decided there was nothing to cut, and an elongated item never lay flat.
        val png = pngOf(100, 100) { g ->
            g.color = Color(0, 0, 0, 6) // haze below the visibility threshold, across the whole canvas
            g.fillRect(0, 0, 100, 100)
            g.color = Color.RED
            g.fillRect(40, 45, 20, 10)
        }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(20, out.width)
        assertEquals(10, out.height)
    }

    @Test
    fun `a real halo around the object survives the crop`() {
        // The threshold must not eat a real glow: an item's soft halo is part of how it looks.
        // The difference is purely quantitative — visible alpha stays inside the bounds.
        val png = pngOf(100, 100) { g ->
            g.color = Color(255, 0, 0, 60) // ~24% opacity: visible to the eye
            g.fillRect(30, 40, 40, 20)
            g.color = Color.RED
            g.fillRect(40, 45, 20, 10)
        }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(40, out.width)
        assertEquals(20, out.height)
    }

    @Test
    fun `crop is tight on every side`() {
        // Margins are often asymmetric — each side must be trimmed on its own.
        val png = pngOf(80, 60) { g -> g.color = Color.BLACK; g.fillRect(5, 30, 40, 10) }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(40, out.width)
        assertEquals(10, out.height)
    }

    private fun pngOf(
        w: Int,
        h: Int,
        opaque: Boolean = false,
        draw: (java.awt.Graphics2D) -> Unit,
    ): ByteArray {
        val type = if (opaque) BufferedImage.TYPE_INT_RGB else BufferedImage.TYPE_INT_ARGB
        val img = BufferedImage(w, h, type)
        img.createGraphics().apply { draw(this); dispose() }
        return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
    }
}
