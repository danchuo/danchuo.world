package world.danchuo.health

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Деталь ночи (PRD §5.4, реестр I-23): выбранная ночь, разложенная во времени.
 *
 * Читается публично, как и всё остальное (§11): защищаются креды записи, а не контент.
 * Даты уведены в октябрь, подальше от ночей соседних тестов: общая БД, и результат не
 * должен зависеть от порядка классов.
 */
@QuarkusTest
class SleepNightResourceTest {

    @Inject
    lateinit var sleepSegmentRepository: SleepSegmentRepository

    /** Даты, за которыми убираем после себя. */
    private val nights = (1..12).map { LocalDate.of(2026, 10, it) }

    private val token = "dev-ingest-token-change-me"

    @AfterEach
    fun cleanUp() {
        QuarkusTransaction.requiringNew().call {
            nights.forEach { sleepSegmentRepository.replaceForWakeDate(it, emptyList()) }
        }
    }

    @Test
    fun `the night comes back as a band on the evening axis`() {
        val date = LocalDate.of(2026, 10, 12)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepSegments":[
                    {"stage":"Core","start":"2026-10-11T23:20:00+03:00","end":"2026-10-12T02:00:00+03:00"},
                    {"stage":"Awake","start":"2026-10-12T02:00:00+03:00","end":"2026-10-12T02:40:00+03:00"},
                    {"stage":"REM","start":"2026-10-12T02:40:00+03:00","end":"2026-10-12T07:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        given().get("/api/sleep/night/$date")
            .then().statusCode(200)
            .body("date", equalTo(date.toString()))
            .body("axisStartHour", equalTo(18))
            .body("band.onsetMinute", equalTo(320)) // 23:20
            .body("band.wakeMinute", equalTo(780)) // 07:00
            // Пробуждение в 02:00 остаётся на полосе своим куском, а не срезается
            .body("band.parts.size()", equalTo(3))
            .body("band.parts[1].stage", equalTo("awake"))
            .body("band.asleepMinutes", equalTo(420)) // 160 + 260, сорок минут возни не в счёт
    }

    @Test
    fun `a day without chunks answers with an empty band, not an error`() {
        given().get("/api/sleep/night/2026-10-20")
            .then().statusCode(200)
            .body("band", nullValue())
    }

    @Test
    fun `a malformed date is rejected, not guessed`() {
        given().get("/api/sleep/night/28-07-2026").then().statusCode(400)
    }
}
