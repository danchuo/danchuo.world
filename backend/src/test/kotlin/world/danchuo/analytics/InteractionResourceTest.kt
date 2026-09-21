package world.danchuo.analytics

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Heatmap click collection (PRD §5.11): public batch POST with no token, private per-tile
 * heatmap behind the bearer, cookieless, bots excluded. Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
class InteractionResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    /** Each case takes its own page, so the shared @QuarkusTest database cannot blur the counts. */
    private fun page() = "/hm-" + UUID.randomUUID()

    private fun post(body: String) =
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("User-Agent", chrome)
            .body(body)
            .post("/api/analytics/interactions")

    private fun heatmap(path: String) =
        given().auth().oauth2(token).get("/api/ingest/analytics/heatmap?path=" + path).then()

    @Test
    fun `interactions are public and a human batch shows up in the private heatmap`() {
        val path = page()
        post(
            """
            {"visitId":"hm-human","path":"$path",
             "clicks":[
               {"tileId":"today","offsetXPct":0.5,"offsetYPct":0.5,"viewportW":1440},
               {"tileId":"music","offsetXPct":0.1,"offsetYPct":0.9,"viewportW":1440}
             ]}
            """.trimIndent(),
        ).then().statusCode(204)

        // The private heatmap sits under api/ingest ⇒ 401 without a token.
        given().get("/api/ingest/analytics/heatmap").then().statusCode(401)

        heatmap(path).statusCode(200)
            .body("path", equalTo(path))
            .body("totalClicks", greaterThanOrEqualTo(2))
    }

    @Test
    fun `a tile carries the click cloud as bins, not as raw points`() {
        // The fractions have been collected since B2 and read by nobody; binning is what turns
        // them into something a tile can draw without shipping every click. PRD §5.11
        val path = page()
        post(
            """
            {"visitId":"hm-bins","path":"$path",
             "clicks":[
               {"tileId":"today","offsetXPct":0.05,"offsetYPct":0.05},
               {"tileId":"today","offsetXPct":0.10,"offsetYPct":0.10},
               {"tileId":"today","offsetXPct":0.95,"offsetYPct":0.95}
             ]}
            """.trimIndent(),
        ).then().statusCode(204)

        val today = "tiles.find { it.tileId == 'today' }"
        heatmap(path).statusCode(200)
            // Two clicks share the top-left bin, one sits in the bottom-right; the 6×6 grid
            // must not let the last bin overflow to index 6.
            .body("$today.cells.find { it.x == 0 && it.y == 0 }.clicks", equalTo(2))
            .body("$today.cells.find { it.x == 5 && it.y == 5 }.clicks", equalTo(1))
    }

    @Test
    fun `a click off every tile is collected as ground, with viewport fractions`() {
        val path = page()
        post(
            """
            {"visitId":"hm-ground","path":"$path",
             "clicks":[{"tileId":null,"offsetXPct":0.25,"offsetYPct":0.75,"viewportW":1440}]}
            """.trimIndent(),
        ).then().statusCode(204)

        heatmap(path).statusCode(200)
            .body("tiles.find { it.tileId == null }.clicks", equalTo(1))
    }

    @Test
    fun `one visitor cannot repaint a tile — the contribution is capped on read`() {
        // Anti-abuse lives on the read side because a public POST cannot be signed. PRD §5.11, §11
        val path = page()
        val many = (1..40).joinToString(",") { """{"tileId":"today","offsetXPct":0.5,"offsetYPct":0.5}""" }
        post("""{"visitId":"hm-spam","path":"$path","clicks":[$many]}""").then().statusCode(204)

        // 40 clicks from one hash, batch ceiling 50, visitor cap 20 ⇒ the aggregate shows 20.
        heatmap(path).statusCode(200)
            .body("tiles.find { it.tileId == 'today' }.clicks", equalTo(20))
    }

    @Test
    fun `interactions require a path`() {
        post("""{"visitId":"no-path","clicks":[{"tileId":"today"}]}""").then().statusCode(400)
    }

    @Test
    fun `empty or coordinateless clicks are tolerated`() {
        // An empty batch is accepted (204); we simply write nothing.
        post("""{"path":"/","clicks":[]}""").then().statusCode(204)
    }
}
