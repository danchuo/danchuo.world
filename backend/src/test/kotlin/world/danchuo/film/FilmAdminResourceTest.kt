package world.danchuo.film

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO

/**
 * Загрузка фото-дропа через /admin (B1, PRD §5.12): zip с кадрами за bearer → ресайз → хранилище.
 * Проверяем сквозной путь — аплоад, выбор обложки, раздача кадра, удаление — и закрытость записи.
 */
@QuarkusTest
class FilmAdminResourceTest {

    private val token = "dev-ingest-token-change-me" // дефолт danchuo.ingest.token в dev/test

    @Test
    fun `upload requires bearer`() {
        given().multiPart("zip", zipOfImages(1))
            .multiPart("title", "Без токена")
            .multiPart("date", "2026-06-10")
            .post("/api/ingest/drops")
            .then().statusCode(401)
    }

    @Test
    fun `upload processes frames, cover is settable, media served, drop deletable`() {
        // Загрузка двух кадров + не-картинки (пропускается).
        val dropId = given()
            .header("Authorization", "Bearer $token")
            .multiPart("zip", zipOfImages(2, withJunk = true))
            // ASCII-заголовок: RestAssured кодирует текстовые multipart-части не в UTF-8, кириллица
            // в тесте манглится (браузерный FormData шлёт UTF-8 — там ок).
            .multiPart("title", "Test film 2026")
            .multiPart("date", "2026-06-10")
            .post("/api/ingest/drops")
            .then().statusCode(201)
            .body("processed", equalTo(2))
            .body("skipped", equalTo(1))
            .body("drop.title", equalTo("Test film 2026"))
            .body("drop.photoCount", equalTo(2))
            .extract().jsonPath().getLong("drop.id")

        // Публичный список содержит дроп с обложкой-thumb.
        given().get("/api/drops")
            .then().statusCode(200)
            .body("find { it.id == $dropId }.coverPhotoUrl", startsWith("/api/film-media/$dropId/"))

        // Кадры в админ-сетке: первый помечен обложкой по умолчанию.
        val photoIds = given().header("Authorization", "Bearer $token")
            .get("/api/ingest/drops/$dropId/photos")
            .then().statusCode(200)
            .extract().jsonPath().getList<Int>("id")

        // Переставить обложку на второй кадр.
        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"photoId": ${photoIds[1]}}""")
            .put("/api/ingest/drops/$dropId/cover")
            .then().statusCode(200)
            .body("coverPhotoId", equalTo(photoIds[1]))

        // Раздача web-варианта первого кадра.
        given().get("/api/film-media/$dropId/0/web")
            .then().statusCode(200)
            .contentType("image/jpeg")

        // Удаление дропа.
        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId")
            .then().statusCode(204)

        given().get("/api/drops/$dropId").then().statusCode(404)
        given().get("/api/film-media/$dropId/0/web").then().statusCode(404)
    }

    /** Zip из [count] сгенерированных PNG (+ опционально текстовый «мусор» для проверки пропуска). */
    private fun zipOfImages(count: Int, withJunk: Boolean = false): File {
        val file = File.createTempFile("drop", ".zip")
        ZipOutputStream(file.outputStream()).use { zip ->
            repeat(count) { i ->
                val img = BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB)
                val g = img.createGraphics()
                g.color = Color(20 + i * 30, 100, 160)
                g.fillRect(0, 0, 120, 80)
                g.dispose()
                val bytes = ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
                zip.putNextEntry(ZipEntry("IMG_%04d.png".format(i)))
                zip.write(bytes)
                zip.closeEntry()
            }
            if (withJunk) {
                // Расширение картинки, но не декодируется (имитация HEIC/битого) ⇒ skipped++.
                // Файл без image-расширения (например .txt) фильтруется раньше и в skipped не идёт.
                zip.putNextEntry(ZipEntry("broken.jpg"))
                zip.write("not an image".toByteArray())
                zip.closeEntry()
            }
        }
        file.deleteOnExit()
        return file
    }
}
