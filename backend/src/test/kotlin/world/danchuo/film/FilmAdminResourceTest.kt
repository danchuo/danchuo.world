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
 * Photo-drop upload through /admin (PRD §5.12): a zip of frames behind the bearer → resize →
 * storage. Covers the whole path — upload, cover choice, frame serving, deletion — and that
 * writing is closed.
 */
@QuarkusTest
class FilmAdminResourceTest {

    private val token = "dev-ingest-token-change-me" // the danchuo.ingest.token default in dev/test

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
        val dropId = given()
            .header("Authorization", "Bearer $token")
            .multiPart("zip", zipOfImages(2, withJunk = true))
            // An ASCII title: RestAssured does not encode text multipart parts as UTF-8 and
            // mangles non-Latin here. The browser's FormData sends UTF-8, so the app is fine.
            .multiPart("title", "Test film 2026")
            .multiPart("date", "2026-06-10")
            .post("/api/ingest/drops")
            .then().statusCode(201)
            .body("processed", equalTo(2))
            .body("skipped", equalTo(1))
            .body("drop.title", equalTo("Test film 2026"))
            .body("drop.photoCount", equalTo(2))
            .extract().jsonPath().getLong("drop.id")

        given().get("/api/drops")
            .then().statusCode(200)
            .body("find { it.id == $dropId }.coverPhotoUrl", startsWith("/api/film-media/$dropId/"))

        // The first frame is the cover by default.
        val photoIds = given().header("Authorization", "Bearer $token")
            .get("/api/ingest/drops/$dropId/photos")
            .then().statusCode(200)
            .extract().jsonPath().getList<Int>("id")

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"photoId": ${photoIds[1]}}""")
            .put("/api/ingest/drops/$dropId/cover")
            .then().statusCode(200)
            .body("coverPhotoId", equalTo(photoIds[1]))

        given().get("/api/film-media/$dropId/0/web")
            .then().statusCode(200)
            .contentType("image/jpeg")

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId")
            .then().statusCode(204)

        given().get("/api/drops/$dropId").then().statusCode(404)
        given().get("/api/film-media/$dropId/0/web").then().statusCode(404)
    }

    /** A zip of [count] generated PNGs, optionally with text junk to check that it is skipped. */
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
                // An image extension that does not decode (a stand-in for HEIC or a corrupt file)
                // ⇒ skipped++. A non-image extension is filtered earlier and never reaches skipped.
                zip.putNextEntry(ZipEntry("broken.jpg"))
                zip.write("not an image".toByteArray())
                zip.closeEntry()
            }
        }
        file.deleteOnExit()
        return file
    }
}
