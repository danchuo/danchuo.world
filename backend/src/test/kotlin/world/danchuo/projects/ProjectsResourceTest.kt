package world.danchuo.projects

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.nullValue
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
            // Конец у сайта ОТКРЫТ (`0700-project-danchuo-open-end`): он идёт по настоящее, и
            // редакция «консоль» читает пустой конец как «жив» — отсюда и год группы, и полная
            // яркость строки (DESIGN §7.8). Закрытый край врал бы про оба.
            .body("find { it.title == 'danchuo.world' }.endYear", nullValue())
            .body("find { it.title == 'danchuo.world' }.endQuarter", nullValue())
    }

    /**
     * У проекта две ссылки разного назначения (PRD §5.7): `url` — путь, который показан
     * строкой под названием, `homeUrl` — куда ведёт сам предмет (название и картинка).
     * У proxemics они РАЗНЫЕ: код лежит в репозитории, а сам проект живёт ботом в телеграме.
     */
    @Test
    fun `proxemics carries its own home link apart from the shown path`() {
        given().get("/api/projects")
            .then().statusCode(200)
            .body("find { it.title == 'proxemics' }.url", equalTo("https://github.com/danchuo/proxemics"))
            .body("find { it.title == 'proxemics' }.homeUrl", equalTo("https://t.me/proxemics_bot"))
            // У сайта дом совпадает с показанным путём — отдельная ссылка ему не нужна.
            .body("find { it.title == 'danchuo.world' }.url", equalTo("https://danchuo.world"))
            .body("find { it.title == 'danchuo.world' }.homeUrl", nullValue())
    }

    @Test
    fun `danchuo world (newest start) sorts above proxemics`() {
        given().get("/api/projects")
            .then().statusCode(200)
            .body("size()", greaterThanOrEqualTo(2))
            .body("[0].title", equalTo("danchuo.world"))
            // Планеты у проекта ДВЕ: плоский спрайт остаётся при нём всегда, объёмная едет
            // рядом (DESIGN §12.5) — какую надеть, решает волна, а не эта запись.
            .body("[0].iconUrl", equalTo("/assets/projects/danchuo-world-px.png"))
            .body("[0].modelUrl", equalTo("/assets/3d/wireframe-globe.glb"))
            .body("find { it.title == 'proxemics' }.modelUrl", equalTo("/assets/3d/spiral-vortex.glb"))
            .body("find { it.title == 'proxemics' }.endYear", equalTo(2026))
            .body("find { it.title == 'proxemics' }.endQuarter", equalTo(2))
    }
}
