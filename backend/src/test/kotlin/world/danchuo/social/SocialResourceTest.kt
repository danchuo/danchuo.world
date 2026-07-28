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
 * Сид артефактов — курируемый набор реальных предметов (миграция 0210 сняла демо-заглушки):
 * «Cyber Y2K Sunglasses» (0210), ракетка YONEX (0220) и мыльница Pentax (0230), у каждого —
 * своя картинка в статике фронта. `imageUrl` остаётся nullable (фронт рисует плейсхолдер), это покрыто юнит-тестом
 * `ArtifactMarquee` на фронте.
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

    @Test
    fun `racket artifact is seeded with its image and first-mentioned date`() {
        // Второй настоящий артефакт (миграция 0220): дата первого упоминания заметно
        // старше первого предмета — порядок ленты курируемый, а не хронологический.
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'YONEX ASTROX 10 WHITE PINK 4U' }.imageUrl",
                equalTo("/assets/artifacts/yonex-astrox-10.png"))
            .body("find { it.name == 'YONEX ASTROX 10 WHITE PINK 4U' }.firstMentionedOn",
                equalTo("2025-06-23"))
            .body("name", hasItem("YONEX ASTROX 10 WHITE PINK 4U"))
    }

    @Test
    fun `camera artifact is seeded with its image and first-mentioned date`() {
        // Третий настоящий артефакт (миграция 0230) — плёночная мыльница фото-дропов.
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'Pentax Espio 738' }.imageUrl",
                equalTo("/assets/artifacts/pentax-espio-738.png"))
            .body("find { it.name == 'Pentax Espio 738' }.firstMentionedOn",
                equalTo("2025-12-20"))
    }

    @Test
    fun `only the racket may be laid on its side`() {
        // Класть предмет набок — свойство самого предмета, а не его пропорции: у очков и
        // мыльницы есть «правильная сторона», у ракетки её нет. По умолчанию — нельзя.
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'YONEX ASTROX 10 WHITE PINK 4U' }.rotatable", equalTo(true))
            .body("find { it.name == 'Cyber Y2K Sunglasses' }.rotatable", equalTo(false))
            .body("find { it.name == 'Pentax Espio 738' }.rotatable", equalTo(false))
    }
}
