package world.danchuo.days

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import world.danchuo.checklist.ChecklistEntryRepository
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

/**
 * `GET /api/days*` (PRD §5.4/§5.6): public reads, the day aggregate and calendar summaries,
 * empty days as a valid projection, the genesis guard, date formats. Dates are relative to MSK
 * today, offsets chosen not to collide with DailyIngestResourceTest — one DB per run.
 */

/**
 * ⚠️ The class MUST clean up after itself. It seeds a sliding window of the last thirty days,
 * while neighbours ([HealthIngestResourceTest]) pin FIXED dates and assert there is no data on
 * them. The day the two meet, the neighbour fails, not us — as on 2026-08-15 for 2026-07-31.
 */
@QuarkusTest
class DaysResourceTest {

    @Inject
    lateinit var dayRecords: DayRecordService

    @Inject
    lateinit var dayRecordRepository: DayRecordRepository

    @Inject
    lateinit var checklistEntries: ChecklistEntryRepository

    private val token = "dev-ingest-token-change-me"

    private val today: LocalDate = LocalDate.now(ZoneId.of("Europe/Moscow"))

    /**
     * Drop the sliding window. Skipping this is what breaks neighbours: seeded days live in the
     * same tables as their fixed dates (see the class doc above).
     */
    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run {
            val from = today.minusDays(SEEDED_WINDOW_DAYS)
            checklistEntries.delete("date >= ?1 and date <= ?2", from, today)
            dayRecordRepository.delete("date >= ?1 and date <= ?2", from, today)
        }
    }

    /** Seed a day through the public ingest seams (as the phone does), so there is something to read. */
    private fun seedDay(date: String, title: String, steps: Int, monster: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":$steps,"sleepMinutes":420,"sleepStages":{"rem":90,"deep":60,"light":250,"awake":20}}""")
            .post("/api/ingest/health").then().statusCode(200)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","title":"$title","items":{"reading":2,"stretch":1},"monsterFlavorKey":"$monster"}""")
            .post("/api/ingest/daily").then().statusCode(200)
    }

    /** A "clean" day: reading 2/2, stretch 1/1, monster NOT drunk (for the inverse streak). */
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

        given().get("/api/days/$date") // no token — reads are public
            .then().statusCode(200)
            .body("date", equalTo("$date"))
            .body("title", equalTo("хороший день"))
            .body("hasData", equalTo(true))
            .body("health.steps", equalTo(8200))
            .body("health.sleepStages.rem", equalTo(90))
            .body("monsterDrunk", equalTo(true))
            // discipline as fractions: reading closed 2/2
            .body("discipline.find { it.key == 'reading' }.count", equalTo(2))
            .body("discipline.find { it.key == 'reading' }.target", equalTo(2))
            .body("discipline.key", hasItem("monster"))
    }

    @Test
    fun `discipline streak skips weekends but monster clean streak counts every day`() {
        // A solid "clean" block of 7 days [−21 … −15], with −22 empty as the wall of the run.
        // Discipline STEPS OVER weekends, the monster counts EVERY day — that is the difference.
        val anchor = today.minusDays(15)
        val blockStart = today.minusDays(21)
        var d = blockStart
        while (!d.isAfter(anchor)) { seedCleanDay("$d"); d = d.plusDays(1) }

        // Expected discipline = the number of WEEKDAYS in the block (weekends are transparent).
        val expectedDiscipline = generateSequence(blockStart) { if (it < anchor) it.plusDays(1) else null }
            .count { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY }

        given().get("/api/days/$anchor") // a past day ⇒ the run counts that day inclusive
            .then().statusCode(200)
            // reading (target 2 → two stops): both runs equal the block's weekday count
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[0]", equalTo(expectedDiscipline))
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[1]", equalTo(expectedDiscipline))
            // stretch (one stop): the same weekday run
            .body("discipline.find { it.key == 'stretch' }.occurrenceStreaks[0]", equalTo(expectedDiscipline))
            // not drunk on all 7 days, nothing before the block ⇒ inverse "clean" streak = 7 (weekends included)
            .body("monsterCleanStreak", equalTo(7))
    }

    /** Automatic health ingest only: the day has a record, but nobody marked the monster. */
    private fun seedHealthOnlyDay(date: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":5100}""")
            .post("/api/ingest/health").then().statusCode(200)
    }

    @Test
    fun `a day nobody reported breaks the clean streak, it is not a clean day`() {
        // Health ingest arrives on its own schedule, so a record does not mean "not drunk".
        // Block: −29 clean, −28 clean, −27 health only (nobody marked), −26 clean; −30 empty.
        seedCleanDay("${today.minusDays(29)}")
        seedCleanDay("${today.minusDays(28)}")
        seedHealthOnlyDay("${today.minusDays(27)}")
        seedCleanDay("${today.minusDays(26)}")

        given().get("/api/days/${today.minusDays(26)}")
            .then().statusCode(200)
            // only −26 counts: the unmarked −27 breaks the run rather than continuing it
            .body("monsterCleanStreak", equalTo(1))
    }

    @Test
    fun `today without a monster report does not add to the clean streak — the report does`() {
        // The owner's exact complaint: auto-health for today arrived, the shortcut has not, and the
        // streak already grew a day. Checked as a DELTA — history before today is shared with
        // other test classes, and the rule is about the "+1 for today".
        seedHealthOnlyDay("$today")

        val beforeReport = given().get("/api/days/$today")
            .then().statusCode(200).extract().path<Int>("monsterCleanStreak")

        // The interactive shortcut with no monster — an honest "not drunk" for today.
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$today","title":"чистый","items":{"stretch":1}}""")
            .post("/api/ingest/daily").then().statusCode(200)

        given().get("/api/days/$today")
            .then().statusCode(200)
            .body("monsterCleanStreak", equalTo(beforeReport + 1))
    }

    @Test
    fun `an unreported day is null, not a clean false`() {
        // Health ingest only: the day HAS a record (hasData=true) but nobody marked discipline or
        // the monster. That is NOT "not drunk" — such a day must render grey on the board.
        val healthOnly = today.minusDays(24)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$healthOnly","steps":4200}""")
            .post("/api/ingest/health").then().statusCode(200)

        given().get("/api/days/$healthOnly")
            .then().statusCode(200)
            .body("hasData", equalTo(true))
            .body("monsterDrunk", nullValue())

        // The same day after the interactive shortcut with no monster — now an honest "not drunk".
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$healthOnly","title":"чистый","items":{"stretch":1}}""")
            .post("/api/ingest/daily").then().statusCode(200)

        given().get("/api/days/$healthOnly")
            .then().statusCode(200)
            .body("monsterDrunk", equalTo(false))
    }

    @Test
    fun `monsterDrunk is true when the shortcut sent a monster`() {
        val date = today.minusDays(25)
        seedDay("$date", "выпил", 6000, "mango-loco")
        given().get("/api/days/$date")
            .then().statusCode(200)
            .body("monsterDrunk", equalTo(true))
    }

    @Test
    fun `missing day is a well-formed empty projection, not an error`() {
        given().get("/api/days/${today.plusDays(30)}")
            .then().statusCode(200)
            .body("hasData", equalTo(false))
            .body("title", nullValue())
            .body("health.steps", nullValue())
            // nobody marked an empty day — there is nothing here to claim "not drunk" with
            .body("monsterDrunk", nullValue())
            // the discipline skeleton is present with progress 0
            .body("discipline.size()", greaterThan(0))
            .body("discipline.find { it.key == 'reading' }.count", equalTo(0))
            // a future or empty day yields no runs
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[0]", equalTo(0))
            .body("monsterCleanStreak", equalTo(0))
    }

    @Test
    fun `range returns a contiguous list of summaries with the monster verdict`() {
        val seeded = today.minusDays(10)
        val empty = today.minusDays(12)
        seedDay("$seeded", "забег", 9000, "mango-loco")

        given().get("/api/days?from=$empty&to=${today.minusDays(8)}")
            .then().statusCode(200)
            .body("size()", equalTo(5)) // a continuous grid over [from, to], inclusive
            .body("find { it.date == '$seeded' }.hasData", equalTo(true))
            .body("find { it.date == '$seeded' }.monsterDrunk", equalTo(true))
            // The "N of M closed" rollup is GONE from the summary: its only consumer was the
            // wave-03 canvas ribbon, which dropped fractions. The lens counts by disciplineCounts.
            .body("find { it.date == '$seeded' }.disciplineDone", nullValue())
            .body("find { it.date == '$seeded' }.disciplineTotal", nullValue())
            .body("find { it.date == '$empty' }.hasData", equalTo(false))
    }

    @Test
    fun `range summaries carry per-item counts for the calendar lens`() {
        // The calendar lens (§5.3) highlights days where an item is closed, so the summary must
        // carry a COUNTER per active item: a stop's threshold is `count >= occurrence`, not
        // "the item is fully done".
        val seeded = today.minusDays(9)
        seedDay("$seeded", "линза", 5000, "mango-loco")

        given().get("/api/days?from=$seeded&to=$seeded")
            .then().statusCode(200)
            // seedDay seeds reading=2, stretch=1 (see above)
            .body("[0].disciplineCounts.reading", equalTo(2))
            .body("[0].disciplineCounts.stretch", equalTo(1))
            // An active item with no marks is present as zero: "not done" differs from "no such item".
            .body("[0].disciplineCounts.journal", equalTo(0))
    }

    /**
     * GitHub contributions (§5.15) reach the calendar summary, and `0` stays zero: the whole
     * distinction "collected, none happened" vs "not collected" (`null`) rests on it.
     */
    @Test
    fun `summary carries github contributions, measured zero included`() {
        val worked = today.minusDays(9)
        val idle = today.minusDays(10)
        QuarkusTransaction.requiringNew().run {
            dayRecords.applyContributions(worked, 15)
            dayRecords.applyContributions(idle, 0)
        }

        given().get("/api/days?from=$idle&to=$worked")
            .then().statusCode(200)
            .body("find { it.date == '$worked' }.contributions", equalTo(15))
            .body("find { it.date == '$idle' }.contributions", equalTo(0))
    }

    /**
     * Collecting contributions does NOT move the freshness lamp (§8): the lamp answers "when did
     * data last arrive from the phone", and a background collector would hold it at "just now".
     */
    @Test
    fun `collecting contributions does not touch the freshness lamp`() {
        val before = given().get("/api/freshness").then().statusCode(200)
            .extract().path<String?>("lastIngestAt")

        QuarkusTransaction.requiringNew().run {
            dayRecords.applyContributions(today.minusDays(11), 7)
        }

        given().get("/api/freshness")
            .then().statusCode(200)
            .body("lastIngestAt", equalTo(before))
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

    private companion object {
        /** How far back the class seeds (the furthest seed is "today − 29"). */
        const val SEEDED_WINDOW_DAYS = 40L
    }
}
