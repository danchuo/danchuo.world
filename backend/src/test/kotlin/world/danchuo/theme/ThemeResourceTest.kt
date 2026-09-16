package world.danchuo.theme

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/theme/active` and `/api/themes` (PRD §5.9; DESIGN §10, §10.1): public reads, the
 * active wave serving tokens as JSONB, and the released list carrying a wave with a layout delta.
 */
@QuarkusTest
class ThemeResourceTest {

    @Test
    fun `active theme is public and returns wave01 tokens`() {
        given().get("/api/theme/active")
            .then().statusCode(200)
            .body("key", equalTo("wave-01"))
            .body("active", equalTo(true))
            // tokens are injected into :root — wave 01's key roles are in place
            .body("tokens.'bg-page'", equalTo("#fdefe7"))
            .body("tokens.accent", notNullValue())
    }

    @Test
    fun `active wave01 has no layout - frontend falls back to default`() {
        // Wave 01 carries no layout (null) ⇒ the frontend takes the default bento (layout.ts).
        given().get("/api/theme/active")
            .then().statusCode(200)
            .body("layout", nullValue())
    }

    @Test
    fun `themes list includes the released wave`() {
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-01"))
    }

    @Test
    fun `wave02 is the obscura restyle - cloud-paper palette and pixel display font`() {
        // Wave 02 "Obscura" (migration 0200): its full token set overrides :root completely, and
        // the heart of the style is the pixel display font on the brand block.
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-02"))
            // a sky-blue canvas instead of wave 01's peach
            .body("find { it.key == 'wave-02' }.tokens.'bg-page'", equalTo("#e3f1fe"))
            // the single Signal Orange
            .body("find { it.key == 'wave-02' }.tokens.accent", equalTo("#ff5e24"))
            // the display-font token is present (Jersey 10 through --font-jersey)
            .body("find { it.key == 'wave-02' }.tokens.'font-display'", notNullValue())
    }

    @Test
    fun `wave02 carries its own arcade-cabinet layout, distinct from wave01`() {
        // Wave 02 carries its own layout (migration 0170 over seed 0080): the marquee is a
        // VERTICAL artifact ribbon down the left edge, "Today" the dominant screen of the centre
        // column. The frontend merges these spans over layout.ts.
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-02"))
            // marquee on the left edge: col 1, full height, turned vertical
            .body("find { it.key == 'wave-02' }.layout.tiles.marquee.col", equalTo(1))
            .body("find { it.key == 'wave-02' }.layout.tiles.marquee.rowSpan", equalTo(28))
            .body("find { it.key == 'wave-02' }.layout.tiles.marquee.orientation", equalTo("vertical"))
            // "Today" as the dominant screen of the cabinet's centre column
            .body("find { it.key == 'wave-02' }.layout.tiles.today.col", equalTo(16))
            // a tile with no orientation serves null (the frontend tile's own default)
            .body("find { it.key == 'wave-02' }.layout.tiles.today.orientation", nullValue())
            // sleep joined the registry after the seed — 0170 gives it its own band, clear of social
            .body("find { it.key == 'wave-02' }.layout.tiles.sleep.col", equalTo(30))
            .body("find { it.key == 'wave-02' }.layout.tiles.sleep.rowSpan", equalTo(5))
            // identity is hidden in wave 01's default — Obscura brings its sign back explicitly
            .body("find { it.key == 'wave-02' }.layout.tiles.identity.hidden", equalTo(false))
    }
}
