package world.danchuo.analytics

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.junit.jupiter.api.Test

/**
 * Сбор кликов хитмапы (PRD §5.11, B2): публичный батч-POST без токена; приватная хитмапа за
 * bearer, потайловый агрегат. Cookieless, боты исключены. (Требует Docker — Dev Services Postgres.)
 */
@QuarkusTest
class InteractionResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    @Test
    fun `interactions are public and a human batch shows up in the private heatmap`() {
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("User-Agent", chrome)
            .body(
                """
                {"visitId":"hm-human","path":"/heatmap-test",
                 "clicks":[
                   {"tileId":"today","offsetXPct":0.5,"offsetYPct":0.5,"viewportW":1440},
                   {"tileId":"music","offsetXPct":0.1,"offsetYPct":0.9,"viewportW":1440}
                 ]}
                """.trimIndent(),
            )
            .post("/api/analytics/interactions")
            .then().statusCode(204)

        // Приватная хитмапа под api/ingest ⇒ без токена 401.
        given().get("/api/ingest/analytics/heatmap")
            .then().statusCode(401)

        // С токеном — потайловый агрегат для нашей страницы.
        given().auth().oauth2(token)
            .get("/api/ingest/analytics/heatmap?path=/heatmap-test")
            .then().statusCode(200)
            .body("path", equalTo("/heatmap-test"))
            .body("totalClicks", greaterThanOrEqualTo(2))
    }

    @Test
    fun `interactions require a path`() {
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en")
            .header("User-Agent", chrome)
            .body("""{"visitId":"no-path","clicks":[{"tileId":"today"}]}""")
            .post("/api/analytics/interactions")
            .then().statusCode(400)
    }

    @Test
    fun `empty or coordinateless clicks are tolerated`() {
        // Пустой батч — приём ок (204), просто ничего не пишем.
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en")
            .header("User-Agent", chrome)
            .body("""{"path":"/","clicks":[]}""")
            .post("/api/analytics/interactions")
            .then().statusCode(204)
    }
}
