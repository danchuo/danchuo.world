package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Публичная лента [BikeRideService.publicList] — ось выдачи это **текущий календарный год** (MSK):
 * велосезон жмётся к лету, поэтому «последние N» заменены на «в этом году». Зимой/в начале года,
 * когда поездок ещё нет, показываем одну самую свежую (последняя прошлого сезона). Проверяем без
 * БД: фейковый репозиторий + фиксированные часы MSK (быстрый юнит, как [VelobikeMappingTest]).
 */
class BikeRideServiceYearTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")

    /** Репозиторий над списком в памяти — реализует ровно то, что зовёт [BikeRideService.publicList]. */
    private class FakeRideRepo(private val all: List<Ride>) : RideRepository() {
        override fun listFrom(from: LocalDate): List<Ride> =
            all.filter { !it.rideDate.isBefore(from) }.sortedByDescending { it.startTime }

        override fun latest(): Ride? = all.maxByOrNull { it.startTime }
    }

    private fun ride(id: Long, date: String): Ride = Ride().apply {
        this.id = id
        externalId = id
        rideDate = LocalDate.parse(date)
        startTime = Instant.parse("${date}T10:00:00Z")
        finishTime = startTime.plusSeconds(600)
        distanceMeters = 1000
        durationSeconds = 600
        createdAt = startTime
        updatedAt = startTime
    }

    private fun serviceAt(today: String, rides: List<Ride>): BikeRideService {
        val clock = Clock.fixed(Instant.parse("${today}T12:00:00Z"), msk)
        return BikeRideService(FakeRideRepo(rides), clock)
    }

    @Test
    fun `отдаёт только поездки текущего года, новые сверху`() {
        val service = serviceAt(
            today = "2026-07-01",
            rides = listOf(
                ride(1, "2025-08-10"), // прошлый сезон — не показываем
                ride(2, "2026-06-21"),
                ride(3, "2026-07-01"), // самая свежая в этом году
            ),
        )

        val out = service.publicList()

        assertEquals(2, out.size)
        assertEquals(listOf("2026-07-01", "2026-06-21"), out.map { it.rideDate })
    }

    @Test
    fun `в этом году поездок нет — показываем одну последнюю из прошлого сезона`() {
        val service = serviceAt(
            today = "2026-01-15", // зима, сезон ещё не начался
            rides = listOf(
                ride(1, "2025-06-01"),
                ride(2, "2025-09-20"), // последняя прошлого сезона
                ride(3, "2025-07-15"),
            ),
        )

        val out = service.publicList()

        assertEquals(1, out.size)
        assertEquals("2025-09-20", out.single().rideDate)
    }

    @Test
    fun `поездок нет вовсе — пустая лента`() {
        val service = serviceAt(today = "2026-07-01", rides = emptyList())
        assertEquals(0, service.publicList().size)
    }
}
