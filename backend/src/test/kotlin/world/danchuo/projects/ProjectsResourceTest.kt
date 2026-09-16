package world.danchuo.projects

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/projects` (PRD §5.7): public reads, the seed project present, raw range fields
 * served as they are (the frontend formats them).
 */
@QuarkusTest
class ProjectsResourceTest {

    @Test
    fun `projects are public and include the seeded project`() {
        given().get("/api/projects") // no token — reads are public
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(1))
            .body("title", hasItem("danchuo.world"))
            .body("find { it.title == 'danchuo.world' }.startYear", equalTo(2026))
            .body("find { it.title == 'danchuo.world' }.startQuarter", equalTo(3))
            // The site's end is OPEN (`0700-project-danchuo-open-end`): the console edition reads
            // an empty end as "alive", which drives both the group year and the row's full
            // brightness (DESIGN §7.8). A closed edge would lie about both.
            .body("find { it.title == 'danchuo.world' }.endYear", nullValue())
            .body("find { it.title == 'danchuo.world' }.endQuarter", nullValue())
    }

    /**
     * Two links with different jobs (PRD §5.7): `url` is the path shown under the title, `homeUrl`
     * is where the item itself leads. For proxemics they DIFFER — code in a repo, the project a bot.
     */
    @Test
    fun `proxemics carries its own home link apart from the shown path`() {
        given().get("/api/projects")
            .then().statusCode(200)
            .body("find { it.title == 'proxemics' }.url", equalTo("https://github.com/danchuo/proxemics"))
            .body("find { it.title == 'proxemics' }.homeUrl", equalTo("https://t.me/proxemics_bot"))
            // The site's home is the shown path, so it needs no separate link.
            .body("find { it.title == 'danchuo.world' }.url", equalTo("https://danchuo.world"))
            .body("find { it.title == 'danchuo.world' }.homeUrl", nullValue())
    }

    @Test
    fun `danchuo world (newest start) sorts above proxemics`() {
        given().get("/api/projects")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(2))
            .body("[0].title", equalTo("danchuo.world"))
            // A project has TWO planets: the flat sprite always, the 3D one alongside
            // (DESIGN §12.5). Which is worn is the wave's decision, not this record's.
            .body("[0].iconUrl", equalTo("/assets/projects/danchuo-world-px.png"))
            .body("[0].modelUrl", equalTo("/assets/3d/wireframe-globe.glb"))
            .body("find { it.title == 'proxemics' }.modelUrl", equalTo("/assets/3d/spiral-vortex.glb"))
            .body("find { it.title == 'proxemics' }.endYear", equalTo(2026))
            .body("find { it.title == 'proxemics' }.endQuarter", equalTo(2))
    }
}
