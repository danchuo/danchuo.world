package world.danchuo.checklist

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import world.danchuo.days.DayRecordRepository
import java.time.LocalDate
import java.time.ZoneId

/**
 * ingest/daily (PRD §5.6, §12 M1): имя дня, прогресс пунктов, отметка монстра.
 * Даты — относительные к «сегодня» MSK: эндпоинт принимает только окно
 * [сегодня − N, сегодня] (danchuo.checklist.ingest-window-days), фикс-даты бы протухли.
 */
@QuarkusTest
class DailyIngestResourceTest {

    @Inject
    lateinit var dayRecordRepository: DayRecordRepository

    @Inject
    lateinit var checklistItems: ChecklistItemRepository

    @Inject
    lateinit var checklistEntries: ChecklistEntryRepository

    private val token = "dev-ingest-token-change-me"

    private val today: LocalDate = LocalDate.now(ZoneId.of("Europe/Moscow"))

    private fun countFor(date: LocalDate, itemKey: String): Int? =
        QuarkusTransaction.requiringNew().call {
            val item = checklistItems.findByKey(itemKey)!!
            checklistEntries.listByDate(date).firstOrNull { it.itemId == item.id }?.count
        }

    @Test
    fun `without token is 401`() {
        given().contentType(ContentType.JSON)
            .body("""{"date":"$today"}""")
            .post("/api/ingest/daily")
            .then().statusCode(401)
    }

    @Test
    fun `stores title, discipline progress and the monster mark`() {
        val date = today.minusDays(1)
        val body = """
            {"date":"$date","title":"первый забег",
             "items":{"stretch":1,"reading":2,"podcasts":1},
             "monsterFlavorKey":"mango-loco"}
        """.trimIndent()

        repeat(2) {
            given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
                .post("/api/ingest/daily")
                .then().statusCode(200)
        }

        QuarkusTransaction.requiringNew().call {
            assertEquals("первый забег", dayRecordRepository.findByDate(date)!!.title)
        }
        assertEquals(1, countFor(date, "stretch"))
        assertEquals(2, countFor(date, "reading"))
        assertEquals(1, countFor(date, "podcasts"))
        // монстр прислан непустым ⇒ пункт = 1
        assertEquals(1, countFor(date, "monster"))
    }

    @Test
    fun `progress is clamped to target`() {
        val date = today.minusDays(2)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"reading":9}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)
        // reading target = 2 → 9 зажимается до 2
        assertEquals(2, countFor(date, "reading"))
    }

    @Test
    fun `no monster field means not drunk - the item is marked zero, not left absent`() {
        val date = today.minusDays(3)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        // Именно 0, а не отсутствие строки: отметка и есть признак «шорткат за день отработал».
        assertEquals(0, countFor(date, "monster"))
    }

    @Test
    fun `unknown checklist item key is 422`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$today","items":{"nope":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(422)
    }

    @Test
    fun `any non-empty monster value counts as drunk - the name is not validated`() {
        // Шорткат на телефоне до сих пор шлёт название вкуса и остаётся рабочим: справочника
        // вкусов больше нет, значение ни с чем не сверяется, важна только непустота.
        val date = today.minusDays(4)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","monsterFlavorKey":"какой-то-снятый-вкус"}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        assertEquals(1, countFor(date, "monster"))
    }

    @Test
    fun `blank monster value is not drunk`() {
        val date = today.minusDays(5)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","monsterFlavorKey":"  "}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        assertEquals(0, countFor(date, "monster"))
    }

    @Test
    fun `future date is rejected - 400 date_out_of_window`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"${today.plusDays(1)}","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(400)
            .body("error", equalTo("date_out_of_window"))
    }

    @Test
    fun `date older than the window is rejected - 400 date_out_of_window`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"${today.minusDays(32)}","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(400)
            .body("error", equalTo("date_out_of_window"))
    }

    @Test
    fun `window boundary - today minus 31 is accepted`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"${today.minusDays(31)}","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)
    }
}
