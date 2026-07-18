package world.danchuo.projects

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.junit.jupiter.api.Test

/**
 * `GET /api/projects` (PRD §5.7, §12 M4): публичное чтение, сид-проект присутствует,
 * сырые поля диапазона отдаются (форматирует фронт).
 */
@QuarkusTest
class ProjectsResourceTest {

    @Test
    fun `projects are public and include the seeded project`() {
        given().get("/api/projects") // без токена — чтение публично
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(1))
            .body("title", hasItem("danchuo.world"))
            .body("find { it.title == 'danchuo.world' }.startYear", equalTo(2026))
            .body("find { it.title == 'danchuo.world' }.startQuarter", equalTo(3))
            .body("find { it.title == 'danchuo.world' }.endQuarter", equalTo(3))
    }

    @Test
    fun `danchuo world (newest start) sorts above proxemics`() {
        given().get("/api/projects")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(2))
            .body("[0].title", equalTo("danchuo.world"))
            .body("[0].iconUrl", equalTo("/assets/projects/danchuo-world-px.png"))
            .body("find { it.title == 'proxemics' }.endYear", equalTo(2026))
            .body("find { it.title == 'proxemics' }.endQuarter", equalTo(2))
    }
}
