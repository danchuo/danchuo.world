package world.danchuo.analytics

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.junit.jupiter.api.Test

/**
 * Analytics beacon (PRD §5.11): public POST with no token, private summary behind the bearer,
 * cookieless, bots excluded. Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
class AnalyticsBeaconResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    @Test
    fun `beacon is public and records a human visit visible in the private summary`() {
        // A human visit: Accept-Language present and a normal UA ⇒ not a bot.
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("User-Agent", chrome)
            .body("""{"visitId":"test-visit-human","path":"/"}""")
            .post("/api/analytics/beacon")
            .then().statusCode(204)

        // The private summary lives under api/ingest ⇒ 401 without a token.
        given().get("/api/ingest/analytics/summary")
            .then().statusCode(401)

        // With the token: per-day aggregates, the human counted.
        given().auth().oauth2(token).get("/api/ingest/analytics/summary")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(1))
            .body("[0].visits", greaterThanOrEqualTo(1))
    }

    @Test
    fun `beacon requires a path`() {
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en")
            .header("User-Agent", chrome)
            .body("""{"visitId":"no-path"}""")
            .post("/api/analytics/beacon")
            .then().statusCode(400)
    }
}
