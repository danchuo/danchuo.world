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
 * `GET /api/days*` (PRD §5.4/§5.6, §12 M2): публичное чтение, агрегат дня и сводки
 * календаря, пустые дни как валидная проекция, генезис-гард, формат дат.
 *
 * Даты — относительные к «сегодня» MSK: ingest/daily принимает только окно
 * [сегодня − 31, сегодня] (§5.6). Смещения не пересекаются с DailyIngestResourceTest
 * (он занимает −1…−3 и −31) — тест-классы делят одну БД в прогоне. Само «сегодня»
 * делится с ним (там оно только в 401/422, которые ничего не пишут), поэтому стрик за
 * сегодня проверяется **дельтой**, а не абсолютным числом: что лежит на −1…−3, зависит
 * от порядка классов.
 *
 * ⚠️ **За собой класс прибирает — иначе он бомба замедленного действия.** Заливает он
 * скользящее окно последних тридцати дней, а соседи (например [HealthIngestResourceTest])
 * держат ФИКСИРОВАННЫЕ даты и проверяют на них отсутствие данных. Пока календарь не свёл
 * их вместе, всё зелено; в тот день, когда «сегодня минус пятнадцать» совпадает с чужой
 * фиксированной датой, у соседа внезапно появляются семь часов сна — и падает он, а не мы.
 * Ровно это и случилось 15.08.2026 с днём 2026-07-31.
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
     * Убрать за собой скользящее окно. Каждый тест класса заливает то, что сам же и читает,
     * поэтому чистить можно после каждого — а вот НЕ чистить нельзя: залитые дни живут в тех
     * же таблицах, что фиксированные даты соседей (см. доккоммент выше).
     */
    @AfterEach
    fun cleanup() {
        QuarkusTransaction.requiringNew().run {
            val from = today.minusDays(SEEDED_WINDOW_DAYS)
            checklistEntries.delete("date >= ?1 and date <= ?2", from, today)
            dayRecordRepository.delete("date >= ?1 and date <= ?2", from, today)
        }
    }

    /** Залить день через публичные ingest-швы (как делает телефон), чтобы было что читать. */
    private fun seedDay(date: String, title: String, steps: Int, monster: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":$steps,"sleepMinutes":420,"sleepStages":{"rem":90,"deep":60,"light":250,"awake":20}}""")
            .post("/api/ingest/health").then().statusCode(200)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","title":"$title","items":{"reading":2,"stretch":1},"monsterFlavorKey":"$monster"}""")
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
            .body("monsterDrunk", equalTo(true))
            // дисциплина — дробями: reading закрыт 2/2
            .body("discipline.find { it.key == 'reading' }.count", equalTo(2))
            .body("discipline.find { it.key == 'reading' }.target", equalTo(2))
            .body("discipline.key", hasItem("monster"))
    }

    @Test
    fun `discipline streak skips weekends but monster clean streak counts every day`() {
        // Непрерывный «чистый» блок из 7 дней [−21 … −15]; перед ним (−22) пусто — стена серии.
        // Дисциплина ВЫХОДНЫЕ ПЕРЕШАГИВАЕТ (не считает), монстр считает КАЖДЫЙ день — вот разница.
        // Смещения −21…−15 свободны (другие тесты берут −1..−3, −6, −10, −12, −31).
        val anchor = today.minusDays(15)
        val blockStart = today.minusDays(21)
        var d = blockStart
        while (!d.isAfter(anchor)) { seedCleanDay("$d"); d = d.plusDays(1) }

        // Ожидаемая дисциплина = число БУДНИХ дней блока (выходные для стрика прозрачны).
        val expectedDiscipline = generateSequence(blockStart) { if (it < anchor) it.plusDays(1) else null }
            .count { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY }

        given().get("/api/days/$anchor") // прошлый день ⇒ серия считается по сам-день включительно
            .then().statusCode(200)
            // reading (target 2 → две остановки): обе серии = число будних дней блока
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[0]", equalTo(expectedDiscipline))
            .body("discipline.find { it.key == 'reading' }.occurrenceStreaks[1]", equalTo(expectedDiscipline))
            // stretch (одна остановка): та же будничная серия
            .body("discipline.find { it.key == 'stretch' }.occurrenceStreaks[0]", equalTo(expectedDiscipline))
            // монстр не пит все 7 дней, до блока запись пуста ⇒ инверсный стрик «чисто» = 7 (выходные тоже)
            .body("monsterCleanStreak", equalTo(7))
    }

    /** Только автоматический health-ingest: запись за день есть, но монстра никто не отмечал. */
    private fun seedHealthOnlyDay(date: String) {
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$date","steps":5100}""")
            .post("/api/ingest/health").then().statusCode(200)
    }

    @Test
    fun `a day nobody reported breaks the clean streak, it is not a clean day`() {
        // Health-ingest приезжает сам по расписанию — наличие записи не значит «не пил».
        // Блок: −29 чист, −28 чист, −27 только health (никто не отмечал), −26 чист; −30 пусто.
        seedCleanDay("${today.minusDays(29)}")
        seedCleanDay("${today.minusDays(28)}")
        seedHealthOnlyDay("${today.minusDays(27)}")
        seedCleanDay("${today.minusDays(26)}")

        given().get("/api/days/${today.minusDays(26)}")
            .then().statusCode(200)
            // считается только сам −26: неотмеченный −27 обрывает серию, а не продолжает её
            .body("monsterCleanStreak", equalTo(1))
    }

    @Test
    fun `today without a monster report does not add to the clean streak — the report does`() {
        // Ровно жалоба владельца: авто-health за сегодня приехал, шорткат ещё нет — и стрик
        // уже вырос на день вперёд. Проверяем дельту, а не абсолют: история до сегодня общая
        // с другими тест-классами, а правило звучит про «+1 за сегодня».
        seedHealthOnlyDay("$today")

        val beforeReport = given().get("/api/days/$today")
            .then().statusCode(200).extract().path<Int>("monsterCleanStreak")

        // Интерактивный шорткат без монстра — честное «не пил» за сегодня.
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$today","title":"чистый","items":{"stretch":1}}""")
            .post("/api/ingest/daily").then().statusCode(200)

        given().get("/api/days/$today")
            .then().statusCode(200)
            .body("monsterCleanStreak", equalTo(beforeReport + 1))
    }

    @Test
    fun `an unreported day is null, not a clean false`() {
        // Только health-ingest: запись за день ЕСТЬ (hasData=true), но дисциплину и монстра
        // никто не отмечал. Это НЕ «не пил» — на борде такой день обязан быть серым.
        val healthOnly = today.minusDays(24)
        given().auth().oauth2(token).contentType(ContentType.JSON)
            .body("""{"date":"$healthOnly","steps":4200}""")
            .post("/api/ingest/health").then().statusCode(200)

        given().get("/api/days/$healthOnly")
            .then().statusCode(200)
            .body("hasData", equalTo(true))
            .body("monsterDrunk", nullValue())

        // Тот же день после интерактивного шортката без монстра — уже честное «не пил».
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
            // пустого дня никто не отмечал — «не пил» тут утверждать нечем
            .body("monsterDrunk", nullValue())
            // каркас дисциплины присутствует с прогрессом 0
            .body("discipline.size()", greaterThan(0))
            .body("discipline.find { it.key == 'reading' }.count", equalTo(0))
            // будущий/пустой день серий не даёт
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
            .body("size()", equalTo(5)) // непрерывная сетка [from, to] включительно
            .body("find { it.date == '$seeded' }.hasData", equalTo(true))
            .body("find { it.date == '$seeded' }.monsterDrunk", equalTo(true))
            // Свёртки «N из M закрыто» в сводке БОЛЬШЕ НЕТ: её единственным потребителем была
            // лента холста волны 03, и та от дробей отказалась (см. DaySummary). Линза считает
            // по disciplineCounts — это проверяет тест ниже.
            .body("find { it.date == '$seeded' }.disciplineDone", nullValue())
            .body("find { it.date == '$seeded' }.disciplineTotal", nullValue())
            .body("find { it.date == '$empty' }.hasData", equalTo(false))
    }

    @Test
    fun `range summaries carry per-item counts for the calendar lens`() {
        // Линза календаря (§5.3): клик по остановке карты подсвечивает дни, где пункт закрыт.
        // Сводка обязана нести СЧЁТЧИК по каждому активному пункту — порог остановки это
        // `count >= occurrence`, а не «пункт выполнен целиком».
        val seeded = today.minusDays(9)
        seedDay("$seeded", "линза", 5000, "mango-loco")

        given().get("/api/days?from=$seeded&to=$seeded")
            .then().statusCode(200)
            // seedDay заливает reading=2, stretch=1 (см. выше)
            .body("[0].disciplineCounts.reading", equalTo(2))
            .body("[0].disciplineCounts.stretch", equalTo(1))
            // Активный пункт без отметок присутствует нулём: «не сделал» отличимо от «нет пункта».
            .body("[0].disciplineCounts.journal", equalTo(0))
    }

    /**
     * Вклады GitHub (§5.15) доезжают до сводки календаря, и `0` при этом остаётся нулём —
     * именно на нём держится различие «собрали, вкладов не было» / «не собирали» (`null`).
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
     * Сбор вкладов **не двигает индикатор свежести** (§8): лампа отвечает на «когда с телефона
     * приезжали данные», а фоновый сборщик, ходящий наружу сам, держал бы её вечно на «только что».
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
        /** Насколько глубоко назад класс заливает дни (самый дальний сид — «сегодня − 29»). */
        const val SEEDED_WINDOW_DAYS = 40L
    }
}
