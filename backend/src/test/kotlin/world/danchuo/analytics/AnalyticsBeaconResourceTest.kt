package world.danchuo.analytics

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import io.restassured.specification.RequestSpecification
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Analytics beacon (PRD §5.11): public POST with no token, private summary behind the bearer,
 * cookieless, bots excluded. Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
class AnalyticsBeaconResourceTest {

    private val token = "dev-ingest-token-change-me"
    private val chrome =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

    /** The @QuarkusTest database is shared, so every case isolates itself by its own campaign. */
    private fun campaign() = "c-" + UUID.randomUUID().toString()

    private fun visit() = UUID.randomUUID().toString()

    private fun beacon(body: String, ua: String = chrome, lang: String = "en-US,en;q=0.9") =
        given().contentType(ContentType.JSON)
            .header("User-Agent", ua)
            .header("Accept-Language", lang)
            .body(body)
            .post("/api/analytics/beacon")

    private fun summary(query: String = "") =
        given().auth().oauth2(token).get("/api/ingest/analytics/summary" + query).then()

    /** One campaign's slice of the shared table: the isolation every case here relies on. */
    private fun campaignStat(key: String, field: String): Int =
        summary().statusCode(200)
            .extract()
            .path<Int?>("breakdowns.utmCampaign.find { it.key == '" + key + "' }." + field) ?: 0

    private fun click(visitId: String, tile: String): RequestSpecification =
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en")
            .header("User-Agent", chrome)
            .body(
                """{"visitId":"$visitId","path":"/","clicks":[{"tileId":"$tile","offsetXPct":0.5,"offsetYPct":0.5}]}""",
            )

    @Test
    fun `beacon is public and records a human visit visible in the private summary`() {
        beacon("""{"visitId":"${visit()}","path":"/"}""").then().statusCode(204)

        // The private summary lives under api/ingest ⇒ 401 without a token.
        given().get("/api/ingest/analytics/summary").then().statusCode(401)

        summary().statusCode(200)
            .body("totals.visits", greaterThanOrEqualTo(1))
            .body("days.size()", greaterThanOrEqualTo(1))
    }

    @Test
    fun `the load ping and its dwell follow-up collapse into ONE visit`() {
        // The race this guards: when the follow-up could not find the load row it inserted a
        // second one, and visits counted the same person twice.
        val key = campaign()
        val id = visit()
        beacon("""{"visitId":"$id","path":"/","utmCampaign":"$key"}""").then().statusCode(204)
        beacon("""{"visitId":"$id","path":"/","dwellMs":4000}""").then().statusCode(204)

        assert(campaignStat(key, "visits") == 1) { "expected exactly one visit for " + key }
    }

    @Test
    fun `repeated dwell flushes keep the MAXIMUM, not the last one`() {
        // Foreground time only grows; a smaller late beacon is an out-of-order delivery, and
        // taking it at face value would demote an engaged visit back to a bounce.
        val key = campaign()
        val id = visit()
        beacon("""{"visitId":"$id","path":"/","utmCampaign":"$key"}""").then().statusCode(204)
        beacon("""{"visitId":"$id","path":"/","dwellMs":25000}""").then().statusCode(204)
        beacon("""{"visitId":"$id","path":"/","dwellMs":3000}""").then().statusCode(204)

        assert(campaignStat(key, "engagedVisits") == 1) { "25s must survive a late 3s beacon" }
    }

    @Test
    fun `a short visit with a click is engaged, a short visit without one is not`() {
        val clicked = campaign()
        val quiet = campaign()

        val clickedId = visit()
        beacon("""{"visitId":"$clickedId","path":"/","utmCampaign":"$clicked"}""").then().statusCode(204)
        beacon("""{"visitId":"$clickedId","path":"/","dwellMs":2000}""").then().statusCode(204)
        click(clickedId, "today").post("/api/analytics/interactions").then().statusCode(204)

        val quietId = visit()
        beacon("""{"visitId":"$quietId","path":"/","utmCampaign":"$quiet"}""").then().statusCode(204)
        beacon("""{"visitId":"$quietId","path":"/","dwellMs":2000}""").then().statusCode(204)

        assert(campaignStat(clicked, "engagedVisits") == 1) { "a click makes a 2s visit engaged" }
        assert(campaignStat(quiet, "engagedVisits") == 0) { "2s and no click is not engagement" }
    }

    @Test
    fun `the new dimensions come back as breakdowns`() {
        val key = campaign()
        beacon(
            """{"visitId":"${visit()}","path":"/","utmSource":"telegram","utmMedium":"post",
                "utmCampaign":"$key","waveKey":"wave-03","viewportW":1536,"viewportH":864,
                "scrollPct":80,"referrer":"https://t.me/some/channel"}""",
        ).then().statusCode(204)

        summary().statusCode(200)
            .body("breakdowns.utmSource.key", hasItem("telegram"))
            .body("breakdowns.utmCampaign.key", hasItem(key))
            .body("breakdowns.wave.key", hasItem("wave-03"))
            .body("breakdowns.device.key", hasItem("DESKTOP"))
            // Grouped by referrer HOST, not by the full URL: one row per source, not per link.
            .body("breakdowns.source.key", hasItem("t.me"))
            // 1536 is the width the owner reviews the board at — it must land in 1440–1919.
            .body("breakdowns.viewport.key", hasItem("1440–1919"))
    }

    @Test
    fun `a bot stays out of the summary`() {
        val key = campaign()
        beacon(
            """{"visitId":"${visit()}","path":"/","utmCampaign":"$key"}""",
            ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        ).then().statusCode(204)

        summary().statusCode(200).body("breakdowns.utmCampaign.key", not(hasItem(key)))
    }

    @Test
    fun `the period is honoured — a window before today holds nothing`() {
        beacon("""{"visitId":"${visit()}","path":"/"}""").then().statusCode(204)

        summary("?from=2000-01-01&to=2000-01-31").statusCode(200).body("totals.visits", equalTo(0))
    }

    @Test
    fun `an over-long path is refused rather than passed to a VARCHAR(512) column`() {
        // Without the ceiling this reaches Postgres and comes back as a 500 with a stack trace,
        // from one curl by anybody. The interactions endpoint next door already refuses it.
        beacon("""{"visitId":"long-path","path":"/${"x".repeat(600)}"}""").then().statusCode(400)
    }

    @Test
    fun `over-long opportunistic fields are dropped, the visit itself still counts`() {
        // Each costs its own field and never the whole beacon — the new dimensions included.
        val key = campaign()
        beacon(
            """{"visitId":"${"v".repeat(200)}","path":"/","referrer":"${"r".repeat(900)}",
                "utmSource":"${"u".repeat(300)}","utmCampaign":"$key","waveKey":"${"w".repeat(200)}"}""",
        ).then().statusCode(204)

        assert(campaignStat(key, "visits") == 1) { "the visit survives its junk fields" }
    }

    @Test
    fun `an over-long Referer header is dropped too`() {
        // The fallback referrer comes from a header, which is just as attacker-controlled.
        given().contentType(ContentType.JSON)
            .header("Accept-Language", "en")
            .header("User-Agent", chrome)
            .header("Referer", "https://example.com/${"r".repeat(900)}")
            .body("""{"visitId":"long-referer-header","path":"/"}""")
            .post("/api/analytics/beacon")
            .then().statusCode(204)
    }

    @Test
    fun `beacon requires a path`() {
        beacon("""{"visitId":"no-path"}""").then().statusCode(400)
    }

    /** Samples of one vital over today; tests run one at a time, so a delta is this case's own. */
    private fun vitalSamples(vital: String): Int =
        summary().statusCode(200).extract().path<Int>("vitals.$vital.samples")

    @Test
    fun `web vitals ride the follow-ups and count once per visit`() {
        val before = vitalSamples("lcpMs")
        val id = visit()
        beacon("""{"visitId":"$id","path":"/"}""").then().statusCode(204)
        beacon("""{"visitId":"$id","path":"/","lcpMs":1800,"clsMilli":40,"inpMs":120}""").then().statusCode(204)
        // A later flush reports the settled value; it replaces the first, it is not a second sample.
        beacon("""{"visitId":"$id","path":"/","lcpMs":2100,"fcpMs":900,"ttfbMs":150}""").then().statusCode(204)

        assert(vitalSamples("lcpMs") == before + 1) { "one visit is one LCP sample" }
        summary().statusCode(200)
            .body("vitals.lcpMs.p75", not(equalTo(null)))
            .body("vitals.cls.samples", greaterThanOrEqualTo(1))
            .body("vitals.ttfbMs.samples", greaterThanOrEqualTo(1))
    }

    @Test
    fun `impossible vitals are dropped, the visit itself still counts`() {
        val key = campaign()
        val before = vitalSamples("inpMs")
        beacon("""{"visitId":"${visit()}","path":"/","utmCampaign":"$key","inpMs":-5,"lcpMs":999999999}""")
            .then().statusCode(204)

        assert(vitalSamples("inpMs") == before) { "a negative INP is not a sample" }
        assert(campaignStat(key, "visits") == 1) { "the visit survives its junk vitals" }
    }
}
