package world.danchuo.social

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/social-links` and `/api/artifacts` (PRD §5.8): public reads, seeds present, an
 * artifact's first-mention date. The artifact seed is a curated set of real items (migrations
 * 0210/0220/0230); `imageUrl` stays nullable and the frontend draws a placeholder.
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
        // The first real artifact (migration 0210, over the removed demo seed 0070).
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'Cyber Y2K Sunglasses' }.imageUrl",
                equalTo("/assets/artifacts/cyber-y2k-sunglasses.png"))
    }

    @Test
    fun `racket artifact is seeded with its image and first-mentioned date`() {
        // The second real artifact (migration 0220): its first-mention date is markedly older
        // than the first item's — the marquee's order is curated, not chronological.
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
        // The third real artifact (migration 0230) — the point-and-shoot of the photo drops.
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'Pentax Espio 738' }.imageUrl",
                equalTo("/assets/artifacts/pentax-espio-738.png"))
            .body("find { it.name == 'Pentax Espio 738' }.firstMentionedOn",
                equalTo("2025-12-20"))
    }

    @Test
    fun `only the racket may be laid on its side`() {
        // Lying flat is a property of the item, not of its proportion: sunglasses and a camera
        // have a right way up, a racket does not. The default is "may not".
        given().get("/api/artifacts")
            .then().statusCode(200)
            .body("find { it.name == 'YONEX ASTROX 10 WHITE PINK 4U' }.rotatable", equalTo(true))
            .body("find { it.name == 'Cyber Y2K Sunglasses' }.rotatable", equalTo(false))
            .body("find { it.name == 'Pentax Espio 738' }.rotatable", equalTo(false))
    }
}
