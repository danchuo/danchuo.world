package world.danchuo.film

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

/**
 * `GET /api/drops*` (PRD §5.12, §12 M4; DESIGN §7.5): каркас фото-дропов. До B1 данных нет —
 * список пуст (не ошибка), неизвестный дроп — 404. Фронт рисует пустое состояние без поломок.
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
