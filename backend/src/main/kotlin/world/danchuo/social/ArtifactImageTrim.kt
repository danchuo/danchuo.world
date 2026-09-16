package world.danchuo.social

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * Trims transparent margins off an artifact image — a pure function, apart from storage and
 * service. The ribbon sizes items by optical weight taken from the PICTURE's proportion, so wide
 * margins both shrink the item and lie about its shape. Measurements and the alpha cut: PRD §5.8.
 */
object ArtifactImageTrim {

    /**
     * Below which alpha a pixel is not part of the object (0..255). NOT "greater than zero" — that
     * was the first version and it silently trimmed NOTHING: background removers leave an
     * invisible 1..8 haze reaching the canvas edges. Measurements: PRD §5.8.
     */
    private const val ALPHA_FLOOR = 8

    /**
     * Trims transparent margins and converts to PNG. Bytes that cannot be decoded come back
     * UNTOUCHED: losing a file the owner uploaded is worse than keeping it untrimmed — the same
     * quiet degradation as a drop frame in an unsupported format.
     */
    fun trim(bytes: ByteArray): ByteArray {
        val source = runCatching { ImageIO.read(bytes.inputStream()) }.getOrNull() ?: return bytes

        val bounds = alphaBounds(source)
        val cropped = if (bounds == null || bounds == FULL(source)) {
            source
        } else {
            source.getSubimage(bounds.x, bounds.y, bounds.width, bounds.height)
        }

        return runCatching {
            ByteArrayOutputStream().also { out ->
                // Copy into a fresh ARGB buffer: getSubimage returns a view onto the source
                // raster, and serving labels the picture image/png whatever was uploaded — so the
                // format is normalised here, on the way in.
                val canvas = BufferedImage(cropped.width, cropped.height, BufferedImage.TYPE_INT_ARGB)
                canvas.createGraphics().apply {
                    drawImage(cropped, 0, 0, null)
                    dispose()
                }
                ImageIO.write(canvas, "png", out)
            }.toByteArray()
        }.getOrDefault(bytes)
    }

    /** Box of visible pixels; `null` when there is no transparency at all, or nothing visible. */
    private fun alphaBounds(img: BufferedImage): java.awt.Rectangle? {
        if (!img.colorModel.hasAlpha()) return null

        var minX = img.width
        var minY = img.height
        var maxX = -1
        var maxY = -1
        for (y in 0 until img.height) {
            for (x in 0 until img.width) {
                // A visible semi-transparent glow around the item is part of its look and belongs
                // in the box; only invisible haze below [ALPHA_FLOOR] is discarded.
                if ((img.getRGB(x, y) ushr 24) <= ALPHA_FLOOR) continue
                if (x < minX) minX = x
                if (y < minY) minY = y
                if (x > maxX) maxX = x
                if (y > maxY) maxY = y
            }
        }
        // Not one visible pixel: trimming would give 0x0, which is no longer a picture (a
        // picture made entirely of haze lands here too — nothing to trim).
        if (maxX < 0) return null
        return java.awt.Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1)
    }

    @Suppress("FunctionName")
    private fun FULL(img: BufferedImage) = java.awt.Rectangle(0, 0, img.width, img.height)
}
