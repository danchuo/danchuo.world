package world.danchuo.social

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import javax.imageio.ImageIO

/**
 * Entering artifacts through /admin (PRD §5.8); before this a new item meant a migration. The DB
 * is shared and neighbours check the public artifact list, so everything created here is removed
 * in [cleanUp] even if a test dies halfway.
 */
@QuarkusTest
class ArtifactAdminResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val created = mutableListOf<Long>()

    @AfterEach
    fun cleanUp() {
        created.forEach { id ->
            given().header("Authorization", "Bearer $token").delete("/api/ingest/artifacts/$id")
        }
        created.clear()
    }

    @Test
    fun `writing artifacts requires bearer`() {
        given().contentType("application/json").body("""{"name":"X","firstMentionedOn":"2026-01-01"}""")
            .post("/api/ingest/artifacts")
            .then().statusCode(401)
        given().get("/api/ingest/artifacts").then().statusCode(401)
    }

    @Test
    fun `artifact can be created, edited, and shows up publicly`() {
        val id = create("Тестовый предмет", hint = "a small green cube")

        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.id == $id }.name", equalTo("Тестовый предмет"))

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body(
                """{"name":"Переименованный","firstMentionedOn":"2026-03-04",
                   "rotatable":true,"detectionHint":"a big red cube"}""",
            )
            .put("/api/ingest/artifacts/$id")
            .then().statusCode(200)
            .body("name", equalTo("Переименованный"))
            .body("rotatable", equalTo(true))
            .body("detectionHint", equalTo("a big red cube"))
    }

    /**
     * The later item is entered first, so insertion order is the reverse of what is expected —
     * otherwise the test would also pass on an accidental sort by id.
     */
    @Test
    fun `artifacts come oldest-first, whatever the order they were entered in`() {
        val later = create("Поздний предмет", date = "2026-05-05")
        val earlier = create("Ранний предмет", date = "2026-04-04")

        listOf("/api/artifacts", "/api/ingest/artifacts").forEach { path ->
            val req = given().let { if (path.startsWith("/api/ingest")) it.header("Authorization", "Bearer $token") else it }
            val ids = req.get(path).then().statusCode(200).extract().jsonPath().getList("id", Long::class.java)
            assertTrue(ids.indexOf(earlier) < ids.indexOf(later), "старое идёт первым в $path")
        }
    }

    @Test
    fun `image upload gives the artifact a served url`() {
        val id = create("С картинкой")

        val url = given().header("Authorization", "Bearer $token")
            .multiPart("image", pngFile())
            .post("/api/ingest/artifacts/$id/image")
            .then().statusCode(200)
            .body("imageUrl", notNullValue())
            .extract().jsonPath().getString("imageUrl")

        given().get(url).then().statusCode(200).contentType("image/png")
    }

    @Test
    fun `hint suggestion degrades quietly when no model is configured`() {
        val id = create("Без модели")
        given().header("Authorization", "Bearer $token")
            .multiPart("image", pngFile())
            .post("/api/ingest/artifacts/$id/image")
            .then().statusCode(200)

        // No LLM key in tests: a 200 with an empty hint rather than an error — the field simply
        // stays the human's.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifacts/$id/hint")
            .then().statusCode(200)
            .body("hint", equalTo(null))
    }

    @Test
    fun `model upload gives the artifact a served url`() {
        val id = create("С моделью")

        val url = given().header("Authorization", "Bearer $token")
            .multiPart("model", glbFile())
            .post("/api/ingest/artifacts/$id/model")
            .then().statusCode(200)
            .body("model3dUrl", notNullValue())
            .extract().jsonPath().getString("model3dUrl")

        given().get(url).then().statusCode(200).contentType("model/gltf-binary")
        // The public list carries it: an item without a model is not in the shaft at all.
        given().get("/api/artifacts").then().statusCode(200)
            .body("find { it.id == $id }.model3dUrl", notNullValue())
    }

    @Test
    fun `anything that is not a glb is refused`() {
        val id = create("Не модель")

        given().header("Authorization", "Bearer $token")
            .multiPart("model", pngFile())
            .post("/api/ingest/artifacts/$id/model")
            .then().statusCode(400)
            .body("error", equalTo("glb_required"))
    }

    @Test
    fun `model can be taken back off the artifact`() {
        val id = create("Снимем модель")
        given().header("Authorization", "Bearer $token")
            .multiPart("model", glbFile())
            .post("/api/ingest/artifacts/$id/model")
            .then().statusCode(200)

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/artifacts/$id/model")
            .then().statusCode(200)
            .body("model3dUrl", equalTo(null))
    }

    @Test
    fun `broken date is rejected`() {
        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"name":"Кривая дата","firstMentionedOn":"вчера"}""")
            .post("/api/ingest/artifacts")
            .then().statusCode(400)
            .body("error", equalTo("invalid_date"))
    }

    // ── Helpers ──

    private fun create(name: String, hint: String? = null, date: String = "2026-02-03"): Long = given()
        .header("Authorization", "Bearer $token")
        .contentType("application/json")
        .body(
            """{"name":"$name","firstMentionedOn":"$date","rotatable":false,
               "detectionHint":${hint?.let { "\"$it\"" } ?: "null"}}""",
        )
        .post("/api/ingest/artifacts")
        .then().statusCode(201)
        .extract().jsonPath().getLong("id")
        .also { created += it }

    /** The smallest thing that is honestly a GLB: the container header plus an empty JSON chunk. */
    private fun glbFile(): File {
        val json = """{"asset":{"version":"2.0"}}""".toByteArray().let {
            it + ByteArray((4 - it.size % 4) % 4) { ' '.code.toByte() }
        }
        val buffer = java.nio.ByteBuffer.allocate(20 + json.size)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
        buffer.put("glTF".toByteArray()).putInt(2).putInt(20 + json.size)
        buffer.putInt(json.size).put("JSON".toByteArray()).put(json)
        val file = File.createTempFile("artifact", ".glb")
        file.writeBytes(buffer.array())
        file.deleteOnExit()
        return file
    }

    private fun pngFile(): File {
        val img = BufferedImage(24, 24, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply {
            color = Color.GREEN
            fillRect(0, 0, 24, 24)
            dispose()
        }
        val file = File.createTempFile("artifact", ".png")
        ImageIO.write(img, "png", file)
        check(ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.size() > 0)
        file.deleteOnExit()
        return file
    }
}
