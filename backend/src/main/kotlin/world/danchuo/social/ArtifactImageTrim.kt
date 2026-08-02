package world.danchuo.social

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * Обрезка прозрачных полей у картинки артефакта (PRD §5.8) — чистая функция, отдельно от
 * хранилища и сервиса.
 *
 * **Зачем.** Лента артефактов (DESIGN §7.2) равняет предметы по оптическому весу, а вес считает
 * от пропорции **картинки**. Пропорция берётся у холста, не у предмета, поэтому картинка с
 * широкими прозрачными полями показывает предмет во столько раз мельче, во сколько поля больше —
 * и вдобавок вводит расчёт в заблуждение: квадратный холст с лежачими очками считается
 * квадратным предметом.
 *
 * Замер на проде: очки занимали **30%** холста 640×640, лента считала их пропорцию 1.00 вместо
 * настоящих 2.82, и предмет рисовался 37×13 px внутри рамки 40×40. После обрезки та же рамка даёт
 * 81×29. Футболка занимала 72% и получала 32×29 вместо 44×40.
 *
 * **Обрезаем только по альфе.** Белый фон не трогаем намеренно: у половины предметов белое —
 * часть самой вещи (белая футболка, белая ракетка), и порог по светлоте съел бы её края. Картинка
 * без прозрачности остаётся как есть.
 *
 * Оригинал не сохраняется — та же политика, что у кадров фото-дропов: промахнулись, перезаливаем.
 */
object ArtifactImageTrim {

    /**
     * Обрезать прозрачные поля и привести к PNG.
     *
     * Не смогли разобрать байты — возвращаем их нетронутыми: потерять загруженный владельцем
     * файл хуже, чем сохранить его необрезанным (та же тихая деградация, что у кадров с
     * неподдерживаемым форматом).
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
                // Копируем в свежий ARGB-буфер: getSubimage отдаёт вид на исходный растр, а
                // раздача помечает картинку image/png независимо от того, что загрузили, —
                // поэтому формат нормализуем здесь, на входе.
                val canvas = BufferedImage(cropped.width, cropped.height, BufferedImage.TYPE_INT_ARGB)
                canvas.createGraphics().apply {
                    drawImage(cropped, 0, 0, null)
                    dispose()
                }
                ImageIO.write(canvas, "png", out)
            }.toByteArray()
        }.getOrDefault(bytes)
    }

    /** Прямоугольник непрозрачных пикселей; `null` — прозрачность отсутствует или картинка пуста. */
    private fun alphaBounds(img: BufferedImage): java.awt.Rectangle? {
        if (!img.colorModel.hasAlpha()) return null

        var minX = img.width
        var minY = img.height
        var maxX = -1
        var maxY = -1
        for (y in 0 until img.height) {
            for (x in 0 until img.width) {
                // Строго > 0: полупрозрачное свечение вокруг предмета — часть его вида.
                if ((img.getRGB(x, y) ushr 24) == 0) continue
                if (x < minX) minX = x
                if (y < minY) minY = y
                if (x > maxX) maxX = x
                if (y > maxY) maxY = y
            }
        }
        // Ни одного непрозрачного пикселя: обрезка дала бы 0×0, а это уже не картинка.
        if (maxX < 0) return null
        return java.awt.Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1)
    }

    @Suppress("FunctionName")
    private fun FULL(img: BufferedImage) = java.awt.Rectangle(0, 0, img.width, img.height)
}
