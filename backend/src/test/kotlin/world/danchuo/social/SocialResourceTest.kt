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
 * сиды присутствуют, у артефакта — дата первого упоминания (в UI только в меню).
 * Сид артефактов — курируемый набор реальных предметов (миграция 0210 сняла демо-заглушки);
 * первый настоящий — «Cyber Y2K Sunglasses» с картинкой. `imageUrl` остаётся nullable
 * (фронт рисует плейсхолдер), это покрыто юнит-тестом `ArtifactMarquee` на фронте.
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
    fun `real seeded artifact carries its image url`() {
        // Первый настоящий артефакт (миграция 0210, поверх снятого демо-сида 0070).
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'Cyber Y2K Sunglasses' }.imageUrl",
                equalTo("/assets/artifacts/cyber-y2k-sunglasses.png"))
    }
}
