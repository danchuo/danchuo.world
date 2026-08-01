package world.danchuo.social

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import javax.imageio.ImageIO

/**
 * Заведение артефактов через /admin (PRD §5.8). До этого новый предмет означал миграцию —
 * то есть правку кода и раскатку.
 *
 * База в тестах общая, а соседние проверяют публичный список артефактов — поэтому всё
 * созданное здесь удаляется в [cleanUp], даже если тест упал на середине.
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
                   "rotatable":true,"sortOrder":7,"detectionHint":"a big red cube"}""",
            )
            .put("/api/ingest/artifacts/$id")
            .then().statusCode(200)
            .body("name", equalTo("Переименованный"))
            .body("rotatable", equalTo(true))
            .body("sortOrder", equalTo(7))
            .body("detectionHint", equalTo("a big red cube"))
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

        // Картинка раздаётся публично, как медиа кадров дропа.
        given().get(url).then().statusCode(200).contentType("image/png")
    }

    @Test
    fun `hint suggestion degrades quietly when no model is configured`() {
        val id = create("Без модели")
        given().header("Authorization", "Bearer $token")
            .multiPart("image", pngFile())
            .post("/api/ingest/artifacts/$id/image")
            .then().statusCode(200)

        // Ключа LLM в тестах нет: ответ 200 с пустой подсказкой, а не ошибка —
        // поле просто остаётся за человеком.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifacts/$id/hint")
            .then().statusCode(200)
            .body("hint", equalTo(null))
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

    // ── Помощники ──

    private fun create(name: String, hint: String? = null): Long = given()
        .header("Authorization", "Bearer $token")
        .contentType("application/json")
        .body(
            """{"name":"$name","firstMentionedOn":"2026-02-03","rotatable":false,
               "sortOrder":99,"detectionHint":${hint?.let { "\"$it\"" } ?: "null"}}""",
        )
        .post("/api/ingest/artifacts")
        .then().statusCode(201)
        .extract().jsonPath().getLong("id")
        .also { created += it }

    private fun pngFile(): File {
        val img = BufferedImage(24, 24, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply {
            color = Color.GREEN
            fillRect(0, 0, 24, 24)
            dispose()
        }
        val file = File.createTempFile("artifact", ".png")
        ImageIO.write(img, "png", file)
        // Проверка, что писалось непусто — иначе тест раздачи стал бы бессмысленным.
        check(ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.size() > 0)
        file.deleteOnExit()
        return file
    }
}
