package world.danchuo.checklist

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import world.danchuo.days.DayRecordRepository
import java.time.LocalDate
import java.time.ZoneId

/**
 * ingest/daily (PRD §5.6, §12 M1): имя дня, прогресс пунктов, монстр как производная вкуса.
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
    fun `stores title, discipline progress and derives monster from flavor`() {
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
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals("первый забег", day.title)
            assertNotNull(day.monsterFlavorId)
        }
        assertEquals(1, countFor(date, "stretch"))
        assertEquals(2, countFor(date, "reading"))
        assertEquals(1, countFor(date, "podcasts"))
        // монстр — производная от вкуса: вкус выбран ⇒ пункт = 1
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
    fun `no flavor means not drunk - monster item is zero`() {
        val date = today.minusDays(3)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            assertNull(dayRecordRepository.findByDate(date)!!.monsterFlavorId)
        }
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
    fun `unknown monster flavor key is 422`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$today","monsterFlavorKey":"nope"}""")
            .post("/api/ingest/daily")
            .then().statusCode(422)
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
