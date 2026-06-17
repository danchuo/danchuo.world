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
    fun `date before genesis is rejected`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"2025-12-31","steps":100}""")
            .post("/api/ingest/health")
            .then().statusCode(422)
    }
}
