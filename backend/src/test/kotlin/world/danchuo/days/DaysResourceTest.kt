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
import java.time.LocalDate
import java.time.ZoneId

/**
 * `GET /api/days*` (PRD §5.4/§5.6, §12 M2): публичное чтение, агрегат дня и сводки
 * календаря, пустые дни как валидная проекция, генезис-гард, формат дат.
 *
 * Даты — относительные к «сегодня» MSK: ingest/daily принимает только окно
 * [сегодня − 31, сегодня] (§5.6). Смещения не пересекаются с DailyIngestResourceTest
 * (он занимает −1…−3 и −31) — тест-классы делят одну БД в прогоне.
 */
@QuarkusTest
class DaysResourceTest {

    private val token = "dev-ingest-token-change-me"

    private val today: LocalDate = LocalDate.now(ZoneId.of("Europe/Moscow"))

    /** Залить день через публичные ingest-швы (как делает телефон), чтобы было что читать. */
    private fun seedDay(date: String, title: String, steps: Int, flavorKey: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":$steps,"sleepMinutes":420,"sleepStages":{"rem":90,"deep":60,"light":250,"awake":20}}""")
            .post("/api/ingest/health").then().statusCode(200)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","title":"$title","items":{"reading":2,"stretch":1},"monsterFlavorKey":"$flavorKey"}""")
            .post("/api/ingest/daily").then().statusCode(200)
    }

    /** «Чистый» день: reading 2/2, stretch 1/1, монстр НЕ пит (для инверсного стрика). */
    private fun seedCleanDay(date: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":7000,"sleepMinutes":420}""")
            .post("/api/ingest/health").then().statusCode(200)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","title":"чистый","items":{"reading":2,"stretch":1}}""")
            .post("/api/ingest/daily").then().statusCode(200)
    }

    @Test
    fun `day read is public and aggregates stats, discipline and monster`() {
        val date = today.minusDays(6)
        seedDay("$date", "хороший день", 8200, "mango-loco")

        given().get("/api/days/$date") // без токена — чтение публично
            .then().statusCode(200)
            .body("date", equalTo("$date"))
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
    fun `day read carries per-occurrence discipline streaks and monster clean streak`() {
        // Три подряд идущих «чистых» дня; до d1 записи нет — там серии обрываются.
        // Смещения −15…−17 свободны (другие тесты берут −1..−3, −6, −8, −10, −12, −31).
        val d1 = today.minusDays(17)
        val d2 = today.minusDays(16)
        val d3 = today.minusDays(15)
        for (d in listOf(d1, d2, d3)) seedCleanDay("$d")

        given().get("/api/days/$d3") // прошлый день ⇒ серия считается по сам-день включительно
            .then().statusCode(200)
            // reading (target 2 → две остановки): обе серии = 3 (три дня подряд с count ≥1 и ≥2)
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[0]", equalTo(3))
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[1]", equalTo(3))
            // stretch (одна остановка): серия = 3
            .body("discipline.find { it.key == 'stretch' }.occurrenceStreaks[0]", equalTo(3))
            // монстр не пит все три дня, до d1 записи нет ⇒ инверсный стрик «чисто» = 3
            .body("monsterCleanStreak", equalTo(3))
    }

    @Test
    fun `missing day is a well-formed empty projection, not an error`() {
        given().get("/api/days/${today.plusDays(30)}")
            .then().statusCode(200)
            .body("hasData", equalTo(false))
            .body("title", nullValue())
            .body("health.steps", nullValue())
            .body("monster", nullValue())
            // каркас дисциплины присутствует с прогрессом 0
            .body("discipline.size()", greaterThan(0))
            .body("discipline.find { it.key == 'reading' }.count", equalTo(0))
            // будущий/пустой день серий не даёт
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[0]", equalTo(0))
            .body("monsterCleanStreak", equalTo(0))
    }

    @Test
    fun `range returns a contiguous list of summaries with monster accent`() {
        val seeded = today.minusDays(10)
        val empty = today.minusDays(12)
        seedDay("$seeded", "забег", 9000, "mango-loco")

        given().get("/api/days?from=$empty&to=${today.minusDays(8)}")
            .then().statusCode(200)
            .body("size()", equalTo(5)) // непрерывная сетка [from, to] включительно
            .body("find { it.date == '$seeded' }.hasData", equalTo(true))
            .body("find { it.date == '$seeded' }.monster.accentColor", notNullValue())
            .body("find { it.date == '$seeded' }.disciplineDone", greaterThan(0))
            .body("find { it.date == '$empty' }.hasData", equalTo(false))
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
