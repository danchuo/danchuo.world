package world.danchuo.core.oauth

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test

/**
 * Every provider's callback is a public HTML page on our OWN origin, and its `error` comes from
 * whoever opened the link. The anchor sits here rather than in a slice: the seam the callbacks
 * share is [OAuthCallbackPage], and a slice wiring past it must fail. PRD §3
 */
@QuarkusTest
class OAuthCallbackEscapingTest {

    private val payload = "<script>alert(1)</script>"

    @Test
    fun `the spotify callback does not reflect markup`() {
        given().queryParam("error", payload)
            .get("/api/spotify/callback")
            .then()
            .statusCode(400)
            .body(not(containsString("<script>")))
            .body(containsString("&lt;script&gt;"))
    }

    @Test
    fun `the instagram callback does not reflect markup`() {
        given().queryParam("error", payload)
            .get("/api/instagram/callback")
            .then()
            .statusCode(400)
            .body(not(containsString("<script>")))
            .body(containsString("&lt;script&gt;"))
    }
}
