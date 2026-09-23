package world.danchuo.checklist

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import world.danchuo.days.DayRecordRepository
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.ZoneId
import java.util.Base64
import javax.imageio.ImageIO

/**
 * ingest/daily (PRD §5.6): the day's name, item progress, the monster mark. Dates are relative
 * to MSK today — the endpoint accepts only [today − N, today], so fixed dates would go stale.
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
        // a non-empty monster value ⇒ the item counts 1
        assertEquals(1, countFor(date, "monster"))
    }

    @Test
    fun `progress is clamped to target`() {
        val date = today.minusDays(2)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"reading":9}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)
        // reading target = 2 → 9 clamps to 2
        assertEquals(2, countFor(date, "reading"))
    }

    @Test
    fun `no monster field means not drunk - the item is marked zero, not left absent`() {
        val date = today.minusDays(3)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"stretch":1}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        // Zero rather than a missing row: the mark itself is the proof the shortcut ran that day.
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
        // The phone shortcut still sends a flavour name and stays valid: there is no flavour
        // catalogue any more, the value is checked against nothing, only non-emptiness matters.
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

    // -- Activities and the day photo (PRD §5.6) --

    private fun ingest(body: String) =
        given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
            .post("/api/ingest/daily")

    private fun jpegBase64(width: Int, height: Int): String {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val out = ByteArrayOutputStream()
        ImageIO.write(image, "jpg", out)
        return Base64.getEncoder().encodeToString(out.toByteArray())
    }

    @Test
    fun `activities are stored in catalogue order and the monster rides the same list`() {
        val date = today.minusDays(6)
        ingest("""{"date":"$date","activities":["Зал","monster","Болдеринг"]}""").then().statusCode(200)

        given().get("/api/days/$date").then().statusCode(200)
            .body("activities", contains("bouldering", "gym"))
            .body("monsterDrunk", equalTo(true))
        // The calendar's range carries them too: an activity is a lens over the grid.
        given().get("/api/days?from=$date&to=$date").then().statusCode(200)
            .body("[0].activities", contains("bouldering", "gym"))
    }

    @Test
    fun `a newline-joined string counts as a list - that is what a text field makes of it`() {
        val date = today.minusDays(7)
        ingest("""{"date":"$date","activities":"сквош\nотжимания"}""").then().statusCode(200)

        given().get("/api/days/$date").then().statusCode(200)
            .body("activities", contains("squash", "pushups"))
            .body("monsterDrunk", equalTo(false))
    }

    @Test
    fun `the list is a snapshot - a repeat without activities clears them`() {
        val date = today.minusDays(8)
        ingest("""{"date":"$date","activities":["турники","брусья"]}""").then().statusCode(200)
        ingest("""{"date":"$date"}""").then().statusCode(200)

        given().get("/api/days/$date").then().statusCode(200)
            .body("activities", empty<String>())
    }

    @Test
    fun `unknown activity is 422 and writes nothing`() {
        val date = today.minusDays(9)
        ingest("""{"date":"$date","title":"не дойдёт","activities":["керлинг"]}""")
            .then().statusCode(422)
            .body("kind", equalTo("activity"))

        QuarkusTransaction.requiringNew().call {
            assertNull(dayRecordRepository.findByDate(date)?.title)
        }
    }

    @Test
    fun `the day photo is stored, served in two sizes and kept when a repeat sends none`() {
        val date = today.minusDays(10)
        ingest("""{"date":"$date","photo":"${jpegBase64(3000, 2000)}"}""").then().statusCode(200)
        ingest("""{"date":"$date","title":"без фото"}""").then().statusCode(200)

        val thumbUrl = given().get("/api/days/$date").then().statusCode(200)
            .body("photo.width", equalTo(2560))
            .body("photo.height", equalTo(1707))
            .extract().path<String>("photo.thumbUrl")

        given().get(thumbUrl).then().statusCode(200).contentType("image/jpeg")
        given().get("/api/days/$date/photo/web").then().statusCode(200).contentType("image/jpeg")
    }

    @Test
    fun `a photo that does not decode is 400 bad_photo`() {
        val date = today.minusDays(11)
        ingest("""{"date":"$date","photo":"bm90IGFuIGltYWdl"}""")
            .then().statusCode(400)
            .body("error", equalTo("bad_photo"))
    }

    @Test
    fun `a day without a photo answers 404 for it and null in the view`() {
        val date = today.minusDays(12)
        ingest("""{"date":"$date"}""").then().statusCode(200)

        given().get("/api/days/$date").then().body("photo", nullValue())
        given().get("/api/days/$date/photo/thumb").then().statusCode(404)
    }
}
