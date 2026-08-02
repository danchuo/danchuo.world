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
 * Обрезка прозрачных полей у картинки артефакта (PRD §5.8).
 *
 * Зачем: лента артефактов (DESIGN §7.2) равняет предметы по **оптическому весу**, считая его от
 * пропорции картинки. Пропорция берётся у холста, а не у предмета — поэтому картинка с широкими
 * прозрачными полями показывает предмет во столько раз мельче, во сколько поля больше.
 *
 * Замер на проде: очки занимали **30%** холста 640×640, и лента считала их квадратными (1.00
 * вместо настоящих 2.82) — предмет рисовался 37×13 px внутри рамки 40×40. После обрезки та же
 * рамка даёт 81×29.
 */
class ArtifactImageTrimTest {

    @Test
    fun `crops transparent margins down to the object`() {
        // Предмет 20x10 в середине холста 100x100 — ровно случай очков с прода.
        val png = pngOf(100, 100) { g -> g.color = Color.RED; g.fillRect(40, 45, 20, 10) }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(20, out.width)
        assertEquals(10, out.height)
    }

    @Test
    fun `keeps a fully opaque image as is`() {
        // Непрозрачный холст (например, фотография) — обрезать нечего, предмет уже во весь кадр.
        val png = pngOf(60, 40, opaque = true) { g -> g.color = Color.BLUE; g.fillRect(0, 0, 60, 40) }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(60, out.width)
        assertEquals(40, out.height)
    }

    @Test
    fun `leaves a fully transparent image alone instead of producing nothing`() {
        // Пустая картинка — вырожденный случай: обрезка дала бы 0x0, а это уже не картинка.
        val png = pngOf(30, 30) { }

        val out = ImageIO.read(ArtifactImageTrim.trim(png).inputStream())

        assertEquals(30, out.width)
        assertEquals(30, out.height)
    }

    @Test
    fun `returns unreadable bytes untouched instead of losing the upload`() {
        // Тихая деградация: не смогли разобрать — отдаём как есть. Потерять загруженный
        // владельцем файл хуже, чем сохранить его необрезанным.
        val junk = byteArrayOf(1, 2, 3, 4, 5)

        assertArrayEquals(junk, ArtifactImageTrim.trim(junk))
    }

    @Test
    fun `normalises other formats to png`() {
        // Раздача помечает картинку image/png независимо от того, что загрузили, поэтому
        // приводим к PNG на входе — иначе JPEG уезжает под чужим content-type.
        val jpeg = ByteArrayOutputStream().also { out ->
            val img = BufferedImage(50, 20, BufferedImage.TYPE_INT_RGB)
            img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, 50, 20); dispose() }
            ImageIO.write(img, "jpg", out)
        }.toByteArray()

        val out = ArtifactImageTrim.trim(jpeg)

        // Сигнатура PNG: 89 50 4E 47.
        assertTrue(out.size > 4 && out[0] == 0x89.toByte() && out[1] == 'P'.code.toByte())
        assertEquals(50, ImageIO.read(out.inputStream()).width)
    }

    @Test
    fun `invisible alpha haze over the canvas does not defeat the crop`() {
        // Главный кейс, найденный на проде. Фон снимали внешним инструментом, и он оставил по
        // всему холсту пиксели с альфой 1..8 (0.4-3% непрозрачности — глазом не видно). При
        // строгом «альфа > 0» рамка непрозрачного растягивалась на весь холст, обрезка решала,
        // что резать нечего, и ракетка 619x2055 уезжала в ленту как холст 1600x2400: лента
        // считала её пропорцию 0.67 вместо 0.30, не признавала вытянутой и не клала набок,
        // хотя предмету это разрешено.
        val png = pngOf(100, 100) { g ->
            g.color = Color(0, 0, 0, 6) // дымка ниже порога видимости — по всему холсту
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
        // Порог не должен съедать настоящее свечение: у предмета бывает мягкий ореол, и он
        // часть его вида. Различие чисто количественное — заметная альфа остаётся в рамке.
        val png = pngOf(100, 100) { g ->
            g.color = Color(255, 0, 0, 60) // ~24% непрозрачности: видно глазом
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
        // Поля бывают несимметричными — обрезка обязана снять каждое по отдельности.
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
