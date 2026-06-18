package world.danchuo.days

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/days*` (PRD §5.4/§5.6, §12 M2): публичное чтение, агрегат дня и сводки
 * календаря, пустые дни как валидная проекция, генезис-гард, формат дат.
 */
@QuarkusTest
class DaysResourceTest {

    private val token = "dev-ingest-token-change-me"

    /** Залить день через публичные ingest-швы (как делает телефон), чтобы было что читать. */
    private fun seedDay(date: String, title: String, steps: Int, flavorKey: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":$steps,"sleepMinutes":420,"sleepStages":{"rem":90,"deep":60,"light":250,"awake":20}}""")
            .post("/api/ingest/health").then().statusCode(200)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","title":"$title","items":{"reading":2,"stretch":1},"monsterFlavorKey":"$flavorKey"}""")
            .post("/api/ingest/daily").then().statusCode(200)
    }

    @Test
    fun `day read is public and aggregates stats, discipline and monster`() {
        seedDay("2026-07-01", "хороший день", 8200, "mango-loco")

        given().get("/api/days/2026-07-01") // без токена — чтение публично
            .then().statusCode(200)
            .body("date", equalTo("2026-07-01"))
            .body("title", equalTo("хороший день"))
            .body("hasData", equalTo(true))
            .body("health.steps", equalTo(8200))
            .body("health.sleepStages.rem", equalTo(90))
            .body("monster.name", notNullValue())
            // дисциплина — дробями: reading закрыт 2/2
            .body("discipline.find { it.key == 'reading' }.count", equalTo(2))
            .body("discipline.find { it.key == 'reading' }.target", equalTo(2))
            .body("discipline.key", hasItem("monster"))
    }

    @Test
    fun `missing day is a well-formed empty projection, not an error`() {
        given().get("/api/days/2026-09-09")
            .then().statusCode(200)
            .body("hasData", equalTo(false))
            .body("title", nullValue())
            .body("health.steps", nullValue())
            .body("monster", nullValue())
            // каркас дисциплины присутствует с прогрессом 0
            .body("discipline.size()", greaterThan(0))
            .body("discipline.find { it.key == 'reading' }.count", equalTo(0))
    }

    @Test
    fun `range returns a contiguous list of summaries with monster accent`() {
        seedDay("2026-07-10", "забег", 9000, "mango-loco")

        given().get("/api/days?from=2026-07-08&to=2026-07-12")
            .then().statusCode(200)
            .body("size()", equalTo(5)) // непрерывная сетка [from, to] включительно
            .body("find { it.date == '2026-07-10' }.hasData", equalTo(true))
            .body("find { it.date == '2026-07-10' }.monster.accentColor", notNullValue())
            .body("find { it.date == '2026-07-10' }.disciplineDone", greaterThan(0))
            .body("find { it.date == '2026-07-08' }.hasData", equalTo(false))
    }

    @Test
    fun `date before genesis is 404`() {
        given().get("/api/days/2025-12-31")
            .then().statusCode(404)
            .body("error", equalTo("before_genesis"))
    }

    @Test
    fun `malformed date is 400`() {
        given().get("/api/days/not-a-date")
            .then().statusCode(400)
            .body("error", equalTo("invalid_date"))
    }

    @Test
    fun `reversed range is 400`() {
        given().get("/api/days?from=2026-07-12&to=2026-07-08")
            .then().statusCode(400)
            .body("error", equalTo("invalid_range"))
    }
}
