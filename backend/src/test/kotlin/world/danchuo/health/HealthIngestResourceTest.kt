package world.danchuo.health

import io.quarkus.narayana.jta.QuarkusTransaction
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import world.danchuo.days.DayRecordRepository
import java.time.LocalDate

/**
 * ingest/health (PRD §5.4, §5.6, §12 M1): bearer-защита, идемпотентность, null ≠ 0, генезис-гард.
 * Плюс производный пункт «дневник» — он ставится минутами «осознанности», а не галочкой.
 */
@QuarkusTest
class HealthIngestResourceTest {

    @Inject
    lateinit var dayRecordRepository: DayRecordRepository

    @Inject
    lateinit var workoutRepository: WorkoutRepository

    @Inject
    lateinit var sleepSegmentRepository: SleepSegmentRepository

    @Inject
    lateinit var checklistItemRepository: ChecklistItemRepository

    @Inject
    lateinit var checklistEntryRepository: ChecklistEntryRepository

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
    fun `empty segment list leaves sleep as it was — a blank run must not wipe a night`() {
        val date = LocalDate.of(2026, 7, 30)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","steps":700,"sleepSegments":[
                    {"stage":"Core","start":"2026-07-29T23:00:00+03:00","end":"2026-07-30T06:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        // Пустой прогон (телефон был заблокирован / окно поиска мимо) — сон не трогаем,
        // и ответ честно об этом говорит: его читают глазами в Show Result на телефоне
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":9100,"sleepSegments":[]}""")
            .post("/api/ingest/health")
            .then().statusCode(200)
            .body("sleepSkipped", org.hamcrest.Matchers.equalTo(true))

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(9100, day.steps) // шаги обновились
            assertEquals(420, day.sleepMinutes) // ночь на месте
            assertEquals(420, day.sleepLightMinutes)
        }
    }

    @Test
    fun `empty segment list on a day without sleep leaves it empty`() {
        val date = LocalDate.of(2026, 7, 31)
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
    fun `legacy zero-minute sleep still clears a stored night — the explicit wipe channel`() {
        val date = LocalDate.of(2026, 8, 1)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepSegments":[
                    {"stage":"Core","start":"2026-07-31T23:00:00+03:00","end":"2026-08-01T06:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","sleepMinutes":0}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            assertNull(dayRecordRepository.findByDate(date)!!.sleepMinutes)
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
    fun `evening mindful minutes over the threshold tick the journal item`() {
        val date = LocalDate.of(2026, 6, 20)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","steps":4000,"mindfulSegments":[
                    {"start":"2026-06-20T23:50:00+03:00","end":"2026-06-21T00:12:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)
            .body("journalDays", org.hamcrest.Matchers.hasItem(date.toString()))

        // Вечер прошит через полночь: 22 минуты принадлежат 20-му, а не 21-му (PRD §5.6).
        assertEquals(1, journalCount(date))
        assertNull(journalCount(date.plusDays(1)))
    }

    @Test
    fun `mindful minutes below the threshold leave the journal undecided`() {
        val date = LocalDate.of(2026, 6, 22)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"2026-06-22T21:00:00+03:00","end":"2026-06-22T21:08:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        // Не 0, а «нет отметки»: восемь минут не отличить от «открыл и закрыл», а ноль
        // занял бы слот и заблокировал более поздний прогон того же вечера.
        assertNull(journalCount(date))
    }

    @Test
    fun `a manual tick wins over mindful minutes`() {
        // Окно ручного ввода — [сегодня − 31, сегодня], поэтому дата считается от «сейчас».
        val date = LocalDate.now(java.time.ZoneId.of("Europe/Moscow")).minusDays(2)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"journal":0}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"${date}T21:00:00+03:00","end":"${date}T21:40:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)
            // Минуты честно посчитаны и видны в ответе, но отметку они не трогают
            .body("journalDays", org.hamcrest.Matchers.empty<String>())

        assertEquals(0, journalCount(date))
    }

    @Test
    fun `measured minutes are stored even when they miss the threshold`() {
        val date = LocalDate.of(2026, 6, 24)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"2026-06-24T21:00:00+03:00","end":"2026-06-24T21:09:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        // Измерение и решение — разные вещи: отметки нет (9 < 15), но минуты записаны.
        // Именно на них борд отвечает «почему не засчиталось» (PRD §5.6).
        QuarkusTransaction.requiringNew().call {
            assertEquals(9, dayRecordRepository.findByDate(date)!!.journalMinutes)
        }
        assertNull(journalCount(date))
    }

    @Test
    fun `minutes land on the evening owner, not on the requested date`() {
        val date = LocalDate.of(2026, 6, 26)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"2026-06-25T23:50:00+03:00","end":"2026-06-26T00:14:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            assertEquals(24, dayRecordRepository.findByDate(date.minusDays(1))!!.journalMinutes)
            assertNull(dayRecordRepository.findByDate(date)!!.journalMinutes)
        }
    }

    @Test
    fun `an empty mindful run leaves stored minutes alone`() {
        val date = LocalDate.of(2026, 6, 28)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"2026-06-28T20:00:00+03:00","end":"2026-06-28T20:19:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        // Пустая выборка неотличима от «не открывал дневник» — та же логика, что у сна:
        // молчание прогона не должно стирать измеренное.
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":120,"mindfulSegments":[]}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val day = dayRecordRepository.findByDate(date)!!
            assertEquals(120, day.steps)
            assertEquals(19, day.journalMinutes)
        }
    }

    @Test
    fun `minutes are measured even when the tick was decided by hand`() {
        val date = LocalDate.now(java.time.ZoneId.of("Europe/Moscow")).minusDays(4)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","items":{"journal":0}}""")
            .post("/api/ingest/daily")
            .then().statusCode(200)

        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","mindfulSegments":[
                    {"start":"${date}T20:00:00+03:00","end":"${date}T20:31:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        // Ручной приоритет касается ОТМЕТКИ, а не измерения — иначе поле молчало бы без причины.
        assertEquals(0, journalCount(date))
        QuarkusTransaction.requiringNew().call {
            assertEquals(31, dayRecordRepository.findByDate(date)!!.journalMinutes)
        }
    }

    @Test
    fun `unparseable mindful timestamp is rejected loudly`() {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"2026-06-23","mindfulSegments":[
                    {"start":"2026-06-23T21:00:00+03:00","end":"23.06.2026 21:40"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(400)
            .body("field", org.hamcrest.Matchers.equalTo("mindfulSegments[0].end"))
    }

    /** Отметка пункта «дневник» за дату; `null` = отметки нет вовсе (пропуск, а не ноль). */
    private fun journalCount(date: LocalDate): Int? = QuarkusTransaction.requiringNew().call {
        val item = checklistItemRepository.findByKey("journal")!!
        checklistEntryRepository.listByDate(date).firstOrNull { it.itemId == item.id }?.count
    }

    // --- сырые куски ночи доживают до базы (I-23) ---

    @Test
    fun `sleep chunks are stored, not just summed away`() {
        val date = LocalDate.of(2026, 8, 20)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepSegments":[
                    {"stage":"Core","start":"2026-08-19T23:20:00+03:00","end":"2026-08-20T02:00:00+03:00"},
                    {"stage":"Awake","start":"2026-08-20T03:40:00+03:00","end":"2026-08-20T04:00:00+03:00"},
                    {"stage":"REM","start":"2026-08-20T04:00:00+03:00","end":"2026-08-20T07:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            val stored = sleepSegmentRepository.listByWakeDate(date)
            assertEquals(3, stored.size)
            // Ровно то, что прислали: пробуждение в 03:40 сохранилось как пробуждение.
            assertEquals(1, stored.count { it.stage == SleepStage.AWAKE })
        }
    }

    @Test
    fun `repeat ingest replaces the chunks instead of piling them up`() {
        val date = LocalDate.of(2026, 8, 21)
        val body = """
            {"date":"$date","sleepSegments":[
              {"stage":"Core","start":"2026-08-20T23:00:00+03:00","end":"2026-08-21T06:00:00+03:00"}]}
        """.trimIndent()

        repeat(2) {
            given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
                .post("/api/ingest/health")
                .then().statusCode(200)
        }

        QuarkusTransaction.requiringNew().call {
            assertEquals(1, sleepSegmentRepository.listByWakeDate(date).size)
        }
    }

    @Test
    fun `a blank run does not wipe the stored chunks either`() {
        val date = LocalDate.of(2026, 8, 22)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepSegments":[
                    {"stage":"Core","start":"2026-08-21T23:00:00+03:00","end":"2026-08-22T06:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":800,"sleepSegments":[]}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            // Та же защита, что у суммы: пустой прогон неотличим от «не спал», ночь остаётся.
            assertEquals(1, sleepSegmentRepository.listByWakeDate(date).size)
        }
    }

    @Test
    fun `the explicit zero-minute wipe clears the chunks too`() {
        val date = LocalDate.of(2026, 8, 23)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body(
                """{"date":"$date","sleepSegments":[
                    {"stage":"Core","start":"2026-08-22T23:00:00+03:00","end":"2026-08-23T06:00:00+03:00"}]}""",
            )
            .post("/api/ingest/health")
            .then().statusCode(200)

        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","sleepMinutes":0}""")
            .post("/api/ingest/health")
            .then().statusCode(200)

        QuarkusTransaction.requiringNew().call {
            // Стереть ночь можно по-прежнему одним явным каналом — и он стирает её целиком.
            assertNull(dayRecordRepository.findByDate(date)!!.sleepMinutes)
            assertEquals(0, sleepSegmentRepository.listByWakeDate(date).size)
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
