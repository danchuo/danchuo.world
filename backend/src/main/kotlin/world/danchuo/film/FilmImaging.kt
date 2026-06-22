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

/** Готовый кадр: два JPEG-варианта + размеры web (после применения EXIF-поворота). */
data class ProcessedImage(
    val webBytes: ByteArray,
    val thumbBytes: ByteArray,
    val width: Int,
    val height: Int,
)

/**
 * Обработка кадров фото-дропа на загрузке (B1, PRD §5.12). Из оригинала телефонного JPEG делает
 * два даунскейл-варианта (web для модалки/борда, thumb для сетки/обложки) и отдаёт их размеры
 * для justified-композиции (§7.5). Применяет EXIF-ориентацию (телефоны пишут поворот тегом, а не
 * пикселями — ImageIO его не учитывает). Неподдерживаемый формат ⇒ `null` (кадр пропускается).
 */
@ApplicationScoped
class FilmImaging(
    @param:ConfigProperty(name = "danchuo.film.web-max-px") private val webMaxPx: Int,
    @param:ConfigProperty(name = "danchuo.film.thumb-max-px") private val thumbMaxPx: Int,
    @param:ConfigProperty(name = "danchuo.film.jpeg-quality") private val jpegQuality: Float,
) {

    /** Обработать байты кадра; `null`, если ImageIO не смог декодировать (напр. HEIC/битый файл). */
    fun process(bytes: ByteArray): ProcessedImage? {
        val src = ImageIO.read(ByteArrayInputStream(bytes)) ?: return null
        val oriented = applyOrientation(src, readOrientation(bytes))
        val web = scaleToRgb(oriented, webMaxPx)
        val thumb = scaleToRgb(oriented, thumbMaxPx)
        return ProcessedImage(toJpeg(web), toJpeg(thumb), web.width, web.height)
    }

    /** EXIF-ориентация (1..8); 1/отсутствует ⇒ нормальная. Ошибки чтения метаданных глотаем. */
    private fun readOrientation(bytes: ByteArray): Int = runCatching {
        ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
            .getFirstDirectoryOfType(ExifIFD0Directory::class.java)
            ?.getInt(ExifIFD0Directory.TAG_ORIENTATION) ?: 1
    }.getOrDefault(1)

    /** Применить EXIF-поворот/отражение; для боковых ориентаций (5–8) меняем местами стороны. */
    private fun applyOrientation(img: BufferedImage, orientation: Int): BufferedImage {
        if (orientation <= 1) return img
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

    /** Даунскейл по большей стороне до `maxPx` (без апскейла) в TYPE_INT_RGB — готов к JPEG. */
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

    /** Кодировать в JPEG с заданным качеством. */
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
