package world.danchuo.film

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.junit.jupiter.api.AfterEach
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO

/**
 * Подсветка артефактов на кадрах (PRD §5.12): прогон, ручные рамки, публичная выдача.
 *
 * В тестах ключа LLM нет ⇒ модель молчит. Это и есть самый ценный кейс: кадры обязаны остаться
 * **непроверенными**, а не «проверенными, ничего не найдено» — иначе один сбой провайдера
 * записался бы в данные как отсутствие артефактов и следующий прогон их бы уже не искал.
 */
@QuarkusTest
class ArtifactScanResourceTest {

    private val token = "dev-ingest-token-change-me"

    /**
     * База в тестах общая, а соседний тест проверяет, что список дропов пуст — залитые здесь
     * дропы обязаны исчезнуть даже если тест упал на середине, иначе порядок классов начинает
     * влиять на результат.
     */
    private val created = mutableListOf<Long>()

    @AfterEach
    fun cleanUp() {
        created.forEach { id ->
            given().header("Authorization", "Bearer $token").delete("/api/ingest/drops/$id")
        }
        created.clear()
    }

    @Test
    fun `scan requires bearer`() {
        given().post("/api/ingest/drops/1/artifacts").then().statusCode(401)
        given().post("/api/ingest/artifact-scan").then().statusCode(401)
    }

    @Test
    fun `silent model leaves frames unchecked instead of marking them empty`() {
        val dropId = upload()

        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/drops/$dropId/artifacts")
            .then().statusCode(202)

        // Прогон синхронно не завершается, но по итогу проверенных быть не должно ни одного.
        awaitScanFinished(dropId)
        given().header("Authorization", "Bearer $token")
            .get("/api/ingest/drops/$dropId/artifacts")
            .then().statusCode(200)
            .body("checked", equalTo(0))

        // И находок тоже нет — публичная выдача кадров чиста.
        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `manual box shows up publicly and can be removed`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(1))
            .body("[0].artifacts[0].artifactId", equalTo(artifactId.toInt()))
            .body("[0].artifacts[0].x0", equalTo(0.1f))
            .body("[0].artifacts[0].y1", equalTo(0.8f))

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().get("/api/drops/$dropId")
            .then().body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `snatched box stays gone after a rerun`() {
        // Удаление помечает находку отклонённой, а не стирает строку: иначе следующий прогон
        // нашёл бы предмет заново и рамка вернулась бы — снятие руками должно быть решением.
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        // Перепрогон по уже проверенным кадрам — отклонённую пару он трогать не должен.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/drops/$dropId/artifacts?recheck=true")
            .then().statusCode(202)
        awaitScanFinished(dropId)

        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `rejected box can be brought back by drawing it again`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()
        val box = """{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}"""

        given().header("Authorization", "Bearer $token").contentType("application/json").body(box)
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().get("/api/drops/$dropId").then().body("[0].artifacts", hasSize<Any>(0))

        // Ручная рамка на ту же пару перезаписывает отклонение — путь назад есть.
        given().header("Authorization", "Bearer $token").contentType("application/json").body(box)
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().get("/api/drops/$dropId").then().body("[0].artifacts", hasSize<Any>(1))
    }

    @Test
    fun `inverted or out-of-frame box is rejected`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        // Правый край левее левого — рамкой это не является.
        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.8,"y0":0.2,"x1":0.3,"y1":0.9}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(400)

        // Доли кадра не выходят за единицу.
        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":1.4,"y1":0.9}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(400)
    }

    @Test
    fun `archive scan reports a summary and can be scoped to one artifact`() {
        val dropId = upload()
        val artifactId = anyArtifactId()

        // Прогон ради одного предмета: сводка называет его, чтобы в админке было видно,
        // что именно сейчас ищется — на длинном прогоне это единственный признак.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifact-scan?artifactId=$artifactId")
            .then().statusCode(202)
            .body("artifactName", org.hamcrest.Matchers.notNullValue())

        awaitScanFinished(dropId)

        given().header("Authorization", "Bearer $token")
            .get("/api/ingest/artifact-scan")
            .then().statusCode(200)
            .body("drops", org.hamcrest.Matchers.greaterThan(0))
            // Модель молчит ⇒ ни одного проверенного кадра, все в пропущенных.
            .body("checked", equalTo(0))
    }

    @Test
    fun `scan scoped to a missing artifact is a 404, not a silent full scan`() {
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifact-scan?artifactId=99999")
            .then().statusCode(404)
    }

    @Test
    fun `cancelling with nothing running is a conflict, not a false success`() {
        // Отменять нечего — ответ обязан это сказать, иначе кнопка «остановить» врала бы
        // об остановке прогона, который на самом деле уже кончился.
        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/artifact-scan")
            .then().statusCode(409)
    }

    // ── Помощники ──

    private fun awaitScanFinished(dropId: Long) {
        repeat(50) {
            val state = given().header("Authorization", "Bearer $token")
                .get("/api/ingest/drops/$dropId/artifacts")
                .then().extract().jsonPath().getString("state")
            // `queued` — дроп ещё ждёт очереди: единственный воркер может разбирать соседний.
            if (state != "running" && state != "queued") return
            Thread.sleep(100)
        }
    }

    private fun anyArtifactId(): Long = given().get("/api/artifacts")
        .then().statusCode(200)
        .extract().jsonPath().getLong("[0].id")

    private fun firstPhotoId(dropId: Long): Long = given().header("Authorization", "Bearer $token")
        .get("/api/ingest/drops/$dropId/photos")
        .then().statusCode(200)
        .extract().jsonPath().getLong("[0].id")

    private fun upload(): Long = given()
        .header("Authorization", "Bearer $token")
        .multiPart("zip", zipOfImages(1))
        .multiPart("title", "Artifacts scan test")
        .multiPart("date", "2026-06-11")
        .post("/api/ingest/drops")
        .then().statusCode(201)
        .extract().jsonPath().getLong("drop.id")
        .also { created += it }

    private fun zipOfImages(count: Int): File {
        val file = File.createTempFile("drop-artifacts", ".zip")
        ZipOutputStream(file.outputStream()).use { zip ->
            repeat(count) { i ->
                val img = BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB)
                img.createGraphics().apply {
                    color = Color(30 + i * 20, 120, 150)
                    fillRect(0, 0, 120, 80)
                    dispose()
                }
                val bytes = ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
                zip.putNextEntry(ZipEntry("IMG_%04d.png".format(i)))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        file.deleteOnExit()
        return file
    }
}
