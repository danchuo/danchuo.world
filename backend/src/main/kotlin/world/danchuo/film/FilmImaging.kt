package world.danchuo.film

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.AffineTransformOp
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** A processed frame: two JPEG variants plus the web dimensions (after the EXIF rotation). */
data class ProcessedImage(
    val webBytes: ByteArray,
    val thumbBytes: ByteArray,
    val width: Int,
    val height: Int,
)

/**
 * Frame rotation while straightening orientation (B9, PRD §9): applied to the already-stored web
 * and thumb variants once the vision LLM, or the owner by hand, decided the frame lies sideways or
 * upside down. Degrees are clockwise; [code] is stored in `film_photo.orientation_applied`.
 */
enum class FrameRotation(val cwDegrees: Int, val code: String) {
    CW90(90, "cw90"),
    R180(180, "r180"),
    CCW90(270, "ccw90"),
    ;

    /** Whether the frame's sides swap (so width/height swap in the DB too). */
    val swapsDimensions: Boolean get() = this != R180

    companion object {
        fun fromCode(code: String?): FrameRotation? = entries.firstOrNull { it.code == code }
    }
}

/**
 * Frame processing on upload: from a phone JPEG it makes two downscaled variants (web and thumb)
 * and reports their sizes for the justified composition. It applies EXIF orientation itself, as
 * phones record rotation as a tag and ImageIO ignores it. Unsupported format ⇒ `null`. PRD §5.12
 */
@ApplicationScoped
class FilmImaging(
    @param:ConfigProperty(name = "danchuo.film.web-max-px") private val webMaxPx: Int,
    @param:ConfigProperty(name = "danchuo.film.thumb-max-px") private val thumbMaxPx: Int,
    @param:ConfigProperty(name = "danchuo.film.jpeg-quality") private val jpegQuality: Float,
) {

    /** Processes frame bytes; `null` when ImageIO cannot decode them (HEIC, a corrupt file). */
    fun process(bytes: ByteArray): ProcessedImage? {
        val src = ImageIO.read(ByteArrayInputStream(bytes)) ?: return null
        val oriented = applyOrientation(src, readOrientation(bytes))
        val web = scaleToRgb(oriented, webMaxPx)
        val thumb = scaleToRgb(oriented, thumbMaxPx)
        return ProcessedImage(toJpeg(web), toJpeg(thumb), web.width, web.height)
    }

    /**
     * Rotates a JPEG frame: decode, affine turn, re-encode at the same quality as upload. `null`
     * if the bytes do not decode. One extra re-encode is invisible on downscaled variants, and
     * originals are not kept, so there is nothing else left to turn.
     */
    fun rotate(bytes: ByteArray, rotation: FrameRotation): ByteArray? {
        val src = ImageIO.read(ByteArrayInputStream(bytes)) ?: return null
        return toJpeg(rotateCw(src, rotation.cwDegrees))
    }

    /** Clockwise rotation by 90, 180 or 270 degrees. */
    private fun rotateCw(source: BufferedImage, cwDegrees: Int): BufferedImage {
        val img = toIntRgb(source) // see applyOrientation: byte-packed src breaks AffineTransformOp
        val w = img.width
        val h = img.height
        val swapped = cwDegrees != 180
        val (dw, dh) = if (swapped) h to w else w to h
        val t = AffineTransform()
        when (cwDegrees) {
            90 -> { t.translate(h.toDouble(), 0.0); t.rotate(Math.PI / 2) }
            180 -> { t.translate(w.toDouble(), h.toDouble()); t.rotate(Math.PI) }
            270 -> { t.translate(0.0, w.toDouble()); t.rotate(3 * Math.PI / 2) }
        }
        val dest = BufferedImage(dw, dh, BufferedImage.TYPE_INT_RGB)
        AffineTransformOp(t, AffineTransformOp.TYPE_BILINEAR).filter(img, dest)
        return dest
    }

    /** EXIF orientation (1..8); 1 or absent means normal. Metadata read errors are swallowed. */
    private fun readOrientation(bytes: ByteArray): Int = runCatching {
        ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
            .getFirstDirectoryOfType(ExifIFD0Directory::class.java)
            ?.getInt(ExifIFD0Directory.TAG_ORIENTATION) ?: 1
    }.getOrDefault(1)

    /** Applies the EXIF rotation/flip; sideways orientations (5-8) swap the sides. */
    private fun applyOrientation(source: BufferedImage, orientation: Int): BufferedImage {
        if (orientation <= 1) return source
        // AffineTransformOp does not accept byte-packed sources (TYPE_3BYTE_BGR from the JPEG
        // reader) with an INT_RGB destination — normalize first or it throws ImagingOpException.
        val img = toIntRgb(source)
        val w = img.width
        val h = img.height
        val swapped = orientation in 5..8
        val (dw, dh) = if (swapped) h to w else w to h
        val t = AffineTransform()
        when (orientation) {
            2 -> { t.scale(-1.0, 1.0); t.translate(-w.toDouble(), 0.0) }
            3 -> { t.translate(w.toDouble(), h.toDouble()); t.rotate(Math.PI) }
            4 -> { t.scale(1.0, -1.0); t.translate(0.0, -h.toDouble()) }
            5 -> { t.rotate(-Math.PI / 2); t.scale(-1.0, 1.0) }
            6 -> { t.translate(h.toDouble(), 0.0); t.rotate(Math.PI / 2) }
            7 -> { t.scale(-1.0, 1.0); t.translate(-h.toDouble(), 0.0); t.translate(0.0, w.toDouble()); t.rotate(3 * Math.PI / 2) }
            8 -> { t.translate(0.0, w.toDouble()); t.rotate(3 * Math.PI / 2) }
        }
        val dest = BufferedImage(dw, dh, BufferedImage.TYPE_INT_RGB)
        val op = AffineTransformOp(t, AffineTransformOp.TYPE_BILINEAR)
        op.filter(img, dest)
        return dest
    }

    /** Converts to TYPE_INT_RGB (a no-op if already) — the format all our operations accept. */
    private fun toIntRgb(img: BufferedImage): BufferedImage {
        if (img.type == BufferedImage.TYPE_INT_RGB) return img
        val out = BufferedImage(img.width, img.height, BufferedImage.TYPE_INT_RGB)
        val g = out.createGraphics()
        g.drawImage(img, 0, 0, null)
        g.dispose()
        return out
    }

    /** Downscales the longer side to `maxPx` (never up) in TYPE_INT_RGB — ready for JPEG. */
    private fun scaleToRgb(img: BufferedImage, maxPx: Int): BufferedImage {
        val scale = min(1.0, maxPx.toDouble() / max(img.width, img.height))
        val nw = max(1, (img.width * scale).roundToInt())
        val nh = max(1, (img.height * scale).roundToInt())
        val dst = BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB)
        val g = dst.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.drawImage(img, 0, 0, nw, nh, null)
        g.dispose()
        return dst
    }

    private fun toJpeg(img: BufferedImage): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val param = writer.defaultWriteParam.apply {
            compressionMode = ImageWriteParam.MODE_EXPLICIT
            compressionQuality = jpegQuality
        }
        val baos = ByteArrayOutputStream()
        ImageIO.createImageOutputStream(baos).use { ios ->
            writer.output = ios
            writer.write(null, IIOImage(img, null, null), param)
        }
        writer.dispose()
        return baos.toByteArray()
    }
}
