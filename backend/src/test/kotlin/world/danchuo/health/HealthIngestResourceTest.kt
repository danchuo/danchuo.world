package world.danchuo.health

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import world.danchuo.days.DayRecordRepository
import java.time.LocalDate

/** ingest/health (PRD §5.4, §12 M1): bearer-защита, идемпотентность, null ≠ 0, генезис-гард. */
@QuarkusTest
class HealthIngestResourceTest {

    @Inject
    lateinit var dayRecordRepository: DayRecordRepository

    @Inject
    lateinit var workoutRepository: WorkoutRepository

    private val token = "dev-ingest-token-change-me"

    @Test
    fun `mutating endpoint without token is 401`() {
        given().contentType(ContentType.JSON)
            .body("""{"date":"2026-06-10","steps":100}""")
            .post("/api/ingest/health")
            .then().statusCode(401)
    }

    @Test
    fun `ingest stores stats and workouts, repeat is idempotent`() {
        val date = LocalDate.of(2026, 6, 11)
        val body = """
            {"date":"$date","steps":8421,"sleepMinutes":437,
             "sleepStages":{"rem":92,"deep":61,"light":264,"awake":20},
             "workouts":[{"type":"running","durationMinutes":31,"activeEnergyKcal":305,"distanceMeters":5100}]}
        """.trimIndent()

        repeat(2) {
            given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
                .post("/api/ingest/health")
                .then().statusCode(200)
        }

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(8421, day.steps)
            assertEquals(437, day.sleepMinutes)
            assertEquals(92, day.sleepRemMinutes)
            // повтор не плодит дубли — ровно одна тренировка (замена набора за дату)
            assertEquals(1, workoutRepository.listByDate(date).size)
        }
    }

    @Test
    fun `zero steps is a real zero, missing sleep stays null`() {
        val date = LocalDate.of(2026, 6, 12)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":0}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(0, day.steps)
            assertNull(day.sleepMinutes)
        }
    }

    @Test
    fun `zero-minute sleep is stored as no-sleep, phases dropped too`() {
        val date = LocalDate.of(2026, 6, 13)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","steps":9000,"sleepMinutes":0,
                    "sleepStages":{"rem":0,"deep":0,"light":0,"awake":7}}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(9000, day.steps) // шаги — обычный ноль-неноль, не тронуты
            assertNull(day.sleepMinutes)
            assertNull(day.sleepRemMinutes)
            assertNull(day.sleepDeepMinutes)
            assertNull(day.sleepLightMinutes)
            assertNull(day.sleepAwakeMinutes)
        }
    }

    @Test
    fun `sleep segments crossing midnight land on the wake day whole`() {
        val date = LocalDate.of(2026, 7, 28)
        val body = """
            {"date":"$date","steps":5000,"sleepSegments":[
              {"stage":"Core","start":"2026-07-27T23:20:00+03:00","end":"2026-07-27T23:50:00+03:00"},
              {"stage":"Deep","start":"2026-07-27T23:50:00+03:00","end":"2026-07-28T00:40:00+03:00"},
              {"stage":"REM","start":"2026-07-28T00:40:00+03:00","end":"2026-07-28T01:40:00+03:00"},
              {"stage":"In Bed","start":"2026-07-27T23:00:00+03:00","end":"2026-07-28T07:20:00+03:00"},
              {"stage":"Core","start":"2026-07-28T01:40:00+03:00","end":"2026-07-28T07:20:00+03:00"}]}
        """.trimIndent()

        given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            // 23:20 → 07:20 целиком, вечерний кусок не потерян; `In Bed` — не сон, ночь не удваивает
            assertEquals(480, day.sleepMinutes)
            assertEquals(60, day.sleepRemMinutes)
            assertEquals(50, day.sleepDeepMinutes)
            assertEquals(370, day.sleepLightMinutes)
        }
    }

    @Test
    fun `sleep segments win over the legacy duration in the same payload`() {
        val date = LocalDate.of(2026, 7, 29)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepMinutes":111,"sleepStages":{"rem":11,"deep":11,"light":89,"awake":3},
                    "sleepSegments":[
                      {"stage":"Asleep","start":"2026-07-28T23:00:00+03:00","end":"2026-07-29T06:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(420, day.sleepMinutes) // посчитано по кускам, а не взято из sleepMinutes
            assertEquals(420, day.sleepLightMinutes) // ночь без часов = неразмеченный сон
        }
    }

    @Test
    fun `empty segment list is an honest no-sleep night, not a zero`() {
        val date = LocalDate.of(2026, 7, 30)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":700,"sleepSegments":[]}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(700, day.steps)
            assertNull(day.sleepMinutes)
        }
    }

    @Test
    fun `unparseable segment timestamp is rejected loudly`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"2026-07-31","sleepSegments":[
                    {"stage":"Core","start":"27.07.2026 23:20","end":"2026-07-28T07:20:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(400)
            .body("field", org.hamcrest.Matchers.equalTo("sleepSegments[0].start"))
    }

    @Test
    fun `date before genesis is rejected`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"2025-12-31","steps":100}""")
            .post("/api/ingest/health")
            .then().statusCode(422)
    }
}
