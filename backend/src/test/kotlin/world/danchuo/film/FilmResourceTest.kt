package world.danchuo.film

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

/**
 * `GET /api/drops*` (PRD §5.12; DESIGN §7.5): the photo-drop skeleton. With no data the list is
 * empty rather than an error and an unknown drop is a 404, so the frontend draws its empty state.
 */
@QuarkusTest
class FilmResourceTest {

    @Test
    fun `drops list is public and empty before B1`() {
        given().get("/api/drops")
            .then().statusCode(200)
            .body("size()", equalTo(0))
    }

    @Test
    fun `unknown drop is 404`() {
        given().get("/api/drops/999999")
            .then().statusCode(404)
            .body("error", equalTo("drop_not_found"))
    }
}
