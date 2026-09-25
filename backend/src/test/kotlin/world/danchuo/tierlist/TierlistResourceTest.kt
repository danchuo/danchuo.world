package world.danchuo.tierlist

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test

/** The tier list shelf (PRD §5.20): public read and publish, moderation behind the bearer. Needs Docker. */
@QuarkusTest
class TierlistResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    private fun publish(body: String) =
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "ru-RU,ru;q=0.9")
            .header("User-Agent", chrome)
            .body(body)
            .post("/api/tierlists")

    @Test
    fun `a published list shows up on the public shelf with every tier`() {
        val nick = "аня ${System.nanoTime()}"
        val id = publish("""{"nick":"$nick","tiers":{"S":["tee-1"],"D":["tee-2","tee-3"]}}""")
            .then().statusCode(201).extract().path<Int>("id")

        given().get("/api/tierlists")
            .then().statusCode(200)
            .body("nick", hasItem(nick))
            .body("find { it.nick == '$nick' }.id", equalTo(id))
            .body("find { it.nick == '$nick' }.tiers.S", equalTo(listOf("tee-1")))
            .body("find { it.nick == '$nick' }.tiers.A", equalTo(emptyList<String>()))
            .body("find { it.nick == '$nick' }.tiers.D", equalTo(listOf("tee-2", "tee-3")))
    }

    @Test
    fun `a malformed list is refused with a machine code`() {
        publish("""{"tiers":{"S":["a"],"A":["a"]}}""").then().statusCode(400).body("error", equalTo("duplicate_item"))
    }

    @Test
    fun `a nick is taken once, whatever its case and edge spaces`() {
        val nick = "мия ${System.nanoTime()}"
        publish("""{"nick":"$nick","tiers":{"S":["tee-1"]}}""").then().statusCode(201)
        publish("""{"nick":"  ${nick.uppercase()} ","tiers":{"A":["tee-1"]}}""")
            .then().statusCode(409).body("error", equalTo("nick_taken")).body("field", equalTo("nick"))
    }

    @Test
    fun `anonymous lists never collide`() {
        publish("""{"tiers":{"S":["tee-1"]}}""").then().statusCode(201)
        publish("""{"nick":"   ","tiers":{"S":["tee-1"]}}""").then().statusCode(201)
    }

    @Test
    fun `the owner deletes a list and it leaves the shelf`() {
        val nick = "удалить ${System.nanoTime()}"
        publish("""{"nick":"$nick","tiers":{"S":["tee-1"]}}""").then().statusCode(201)

        val id = given().auth().oauth2(token).get("/api/ingest/tierlists")
            .then().statusCode(200)
            .body("find { it.nick == '$nick' }.isBot", equalTo(false))
            .extract().path<Int>("find { it.nick == '$nick' }.id")

        given().auth().oauth2(token).delete("/api/ingest/tierlists/$id").then().statusCode(204)
        given().get("/api/tierlists").then().body("nick", not(hasItem(nick)))
    }

    @Test
    fun `moderation needs the bearer`() {
        given().get("/api/ingest/tierlists").then().statusCode(401)
        given().delete("/api/ingest/tierlists/1").then().statusCode(401)
    }
}
