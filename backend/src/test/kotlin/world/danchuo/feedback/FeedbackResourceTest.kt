package world.danchuo.feedback

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test

/**
 * The note endpoint (PRD §5.19): public POST with no token, private inbox behind the bearer.
 * Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
class FeedbackResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    private fun post(body: String) =
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "ru-RU,ru;q=0.9")
            .header("User-Agent", chrome)
            .body(body)
            .post("/api/feedback")

    @Test
    fun `a note is public to send and shows up in the private inbox with its context`() {
        val marker = "нравится календарь ${System.nanoTime()}"
        post(
            """
            {"likedMost":"$marker","signature":"аня","path":"/","waveKey":"wave-01",
             "selectedDay":"2026-09-21","viewportW":1536,"viewportH":864}
            """.trimIndent(),
        ).then().statusCode(204)

        given().auth().oauth2(token).get("/api/ingest/feedback")
            .then().statusCode(200)
            .body("likedMost", hasItem(marker))
            .body("find { it.likedMost == '$marker' }.signature", equalTo("аня"))
            .body("find { it.likedMost == '$marker' }.waveKey", equalTo("wave-01"))
            .body("find { it.likedMost == '$marker' }.selectedDay", equalTo("2026-09-21"))
            .body("find { it.likedMost == '$marker' }.deviceType", equalTo("DESKTOP"))
    }

    /**
     * The bot mark travels as `isBot`, not `bot`. Runtime Jackson strips the "is" prefix from a
     * boolean getter, and the admin reads the flag by name — a silent rename dims nothing.
     */
    @Test
    fun `the bot flag keeps its wire name`() {
        val marker = "имя поля ${System.nanoTime()}"
        post("""{"path":"/","likedMost":"$marker"}""").then().statusCode(204)

        given().auth().oauth2(token).get("/api/ingest/feedback")
            .then().statusCode(200)
            .body("find { it.likedMost == '$marker' }.isBot", equalTo(false))
    }

    @Test
    fun `the inbox is private`() {
        given().get("/api/ingest/feedback").then().statusCode(401)
    }

    @Test
    fun `a note with no answers is refused`() {
        post("""{"path":"/","signature":"аня"}""")
            .then().statusCode(400)
            .body("error", equalTo("empty"))
    }

    @Test
    fun `an over-long answer is refused with the field named`() {
        post("""{"path":"/","likedMost":"${"я".repeat(FeedbackLimits.ANSWER + 1)}"}""")
            .then().statusCode(400)
            .body("error", equalTo("too_long"))
            .body("field", equalTo("likedMost"))
    }

    @Test
    fun `a filled honeypot looks accepted but stores nothing`() {
        val marker = "спам ${System.nanoTime()}"
        post("""{"path":"/","likedMost":"$marker","website":"http://spam.example"}""")
            .then().statusCode(204)

        given().auth().oauth2(token).get("/api/ingest/feedback")
            .then().statusCode(200)
            .body("likedMost", not(hasItem(marker)))
    }

    @Test
    fun `the owner can delete a note`() {
        val marker = "удалить ${System.nanoTime()}"
        post("""{"path":"/","wouldChange":"$marker"}""").then().statusCode(204)

        val id = given().auth().oauth2(token).get("/api/ingest/feedback")
            .then().statusCode(200)
            .extract().path<Int>("find { it.wouldChange == '$marker' }.id")

        given().auth().oauth2(token).delete("/api/ingest/feedback/$id").then().statusCode(204)
        given().auth().oauth2(token).delete("/api/ingest/feedback/$id").then().statusCode(404)
    }
}
