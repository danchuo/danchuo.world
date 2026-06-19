package world.danchuo.social

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/social-links` и `/api/artifacts` (PRD §5.8, §12 M4): публичное чтение,
 * сиды присутствуют, у артефакта — дата первого упоминания (в UI только в поповере).
 * Артефакт может быть без картинки (`imageUrl == null` — фронт рисует пиксель-плейсхолдер).
 */
@QuarkusTest
class SocialResourceTest {

    @Test
    fun `social links are public and seeded`() {
        given().get("/api/social-links")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(1))
            .body("platform", hasItem("github"))
    }

    @Test
    fun `artifacts are public and carry first-mentioned date`() {
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(1))
            .body("[0].firstMentionedOn", notNullValue())
    }

    @Test
    fun `artifacts may have no image - imageUrl is null`() {
        // Сид содержит артефакты без картинки (напр. «Очки», «Футболка 1/2») —
        // imageUrl приходит null, фронт рисует плейсхолдер вместо img.
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("findAll { it.imageUrl == null }.size()", greaterThanOrEqualTo(1))
            // …и при этом у артефакта с картинкой imageUrl на месте (оба случая сосуществуют).
            .body("find { it.name == 'Камера' }.imageUrl", equalTo("/assets/artifacts/camera.png"))
    }
}
