package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * [BikeRideService.publicList] is axed on the CURRENT calendar year (MSK), not "the last N":
 * before the season starts we still show the one freshest ride. Fake repos + fixed clock, no DB.
 */
class BikeRideServiceYearTest {

    private val msk: ZoneId = ZoneId.of("Europe/Moscow")

    /** Repository over an in-memory list — implements exactly what [BikeRideService.publicList] calls. */
    private class FakeRideRepo(private val all: List<Ride>) : RideRepository() {
        override fun listFrom(from: LocalDate): List<Ride> =
            all.filter { !it.rideDate.isBefore(from) }.sortedByDescending { it.startTime }

        override fun listOrderedDesc(): List<Ride> = all.sortedByDescending { it.startTime }

        override fun latest(): Ride? = all.maxByOrNull { it.startTime }
    }

    /** Tariff purchases in memory, newest first (as real [BikeTariffRepository.listOrderedDesc]). */
    private class FakeTariffRepo(private val all: List<BikeTariff>) : BikeTariffRepository() {
        override fun listOrderedDesc(): List<BikeTariff> = all.sortedByDescending { it.purchasedAt }
    }

    /** Station coordinate cache in memory: address → coords (as [BikeStationRepository.foundCoords]). */
    private class FakeStationRepo(private val coords: Map<String, Pair<Double, Double>>) : BikeStationRepository() {
        override fun foundCoords(): Map<String, Pair<Double, Double>> = coords
    }

    private fun ride(
        id: Long,
        date: String,
        cost: Int? = null,
        duration: Int = 600,
        tariff: String? = null,
        at: String = "10:00:00",
    ): Ride = Ride().apply {
        this.id = id
        externalId = id
        rideDate = LocalDate.parse(date)
        tariffName = tariff
        startTime = Instant.parse("${date}T${at}Z")
        finishTime = startTime.plusSeconds(duration.toLong())
        distanceMeters = 1000
        durationSeconds = duration
        costKopecks = cost
        createdAt = startTime
        updatedAt = startTime
    }

    private fun tariff(
        date: String,
        kopecks: Int,
        name: String? = null,
        at: String = "09:00:00",
    ): BikeTariff = BikeTariff().apply {
        externalId = "t-$date-$at"
        purchasedAt = Instant.parse("${date}T${at}Z")
        priceKopecks = kopecks
        this.name = name
    }

    private fun serviceAt(
        today: String,
        rides: List<Ride>,
        tariffs: List<BikeTariff> = emptyList(),
        stationCoords: Map<String, Pair<Double, Double>> = emptyMap(),
    ): BikeRideService {
        val clock = Clock.fixed(Instant.parse("${today}T12:00:00Z"), msk)
        return BikeRideService(FakeRideRepo(rides), FakeTariffRepo(tariffs), FakeStationRepo(stationCoords), clock)
    }

    @Test
    fun `отдаёт только поездки текущего года, новые сверху`() {
        val service = serviceAt(
            today = "2026-07-01",
            rides = listOf(
                ride(1, "2025-08-10"), // last season — not shown
                ride(2, "2026-06-21"),
                ride(3, "2026-07-01"), // the freshest this year
            ),
        )

        val out = service.publicList()

        assertEquals(2, out.size)
        assertEquals(listOf("2026-07-01", "2026-06-21"), out.map { it.rideDate })
    }

    @Test
    fun `в этом году поездок нет — показываем одну последнюю из прошлого сезона`() {
        val service = serviceAt(
            today = "2026-01-15", // winter, the season has not started
            rides = listOf(
                ride(1, "2025-06-01"),
                ride(2, "2025-09-20"), // the last of last season
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

    @Test
    fun `точка рисуется по станции (по адресу), сырой GPS — фолбэк без станции`() {
        val ride = ride(1, "2026-07-05").apply {
            startAddress = "метро Кунцевская"
            startLat = 55.95; startLon = 37.42 // a GPS fix thrown to the airport — must be overridden
            finishAddress = "ст. м. Молодёжная (выход № 2)" // not in the station cache ⇒ GPS stands
            finishLat = 55.74; finishLon = 37.42
        }
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(ride),
            stationCoords = mapOf("метро Кунцевская" to (55.7305 to 37.4460)), // a real station
        )

        val out = service.publicList().single()

        assertEquals(55.7305, out.startLat) // taken from the station, not from the stray GPS
        assertEquals(37.4460, out.startLon)
        assertEquals(55.74, out.finishLat) // the finish station is not cached ⇒ fall back to GPS
    }

    @Test
    fun `проекция несёт доступ, купленный ради поездки, и её полную стоимость`() {
        // The case from the board: "an hour for 399 ₽" plus 2 minutes over (7.49 ₽) — 7 ₽ is NOT the whole price.
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(ride(1, "2026-07-05", cost = 749, tariff = "Пакет 60 минут", at = "09:00:06")),
            tariffs = listOf(tariff("2026-07-05", 39900, "Доступ Пакет 60 минут")),
        )

        val out = service.publicList().single()

        assertEquals(39900, out.accessKopecks)
        assertEquals(749, out.costKopecks)
        assertEquals(40649, out.totalKopecks)
        assertEquals(null, out.coveredByTariffKopecks) // this very ride bought the access
    }

    @Test
    fun `поездка под ранее купленным пакетом покрыта им, но денег за него не берёт`() {
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(
                ride(1, "2026-07-05", cost = 0, tariff = "Пакет 60 минут", at = "09:00:06"), // bought the access
                ride(2, "2026-07-05", cost = 15400, tariff = "Пакет 60 минут", at = "12:00:00"), // over the package
            ),
            tariffs = listOf(tariff("2026-07-05", 39900, "Доступ Пакет 60 минут")),
        )

        val out = service.publicList().associateBy { it.id }

        assertEquals(39900, out[1L]!!.accessKopecks)
        assertEquals(39900, out[1L]!!.totalKopecks)
        assertEquals(null, out[2L]!!.accessKopecks) // the same 399 ₽ is not counted twice
        assertEquals(39900, out[2L]!!.coveredByTariffKopecks)
        assertEquals(15400, out[2L]!!.totalKopecks)
    }

    @Test
    fun `поездка без покупок в истории — как была, без доступа и покрытия`() {
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(ride(1, "2026-07-06", cost = 5243, tariff = "Поминутный")),
        )

        val out = service.publicList().single()

        assertEquals(null, out.accessKopecks)
        assertEquals(null, out.coveredByTariffKopecks)
        assertEquals(5243, out.totalKopecks)
    }

    @Test
    fun `сводка месяца — только текущий календарный месяц (MSK), поездки и минуты`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(
                ride(1, "2026-06-30", duration = 900), // last month — out of scope
                ride(2, "2026-07-02", duration = 600), // 10 min
                ride(3, "2026-07-14", duration = 1200), // 20 min
            ),
        )

        val s = service.monthSummary()

        assertEquals("2026-07", s.month)
        assertEquals(2, s.rides)
        assertEquals(1800L, s.durationSeconds) // 600 + 1200; June's ride is not counted
    }

    @Test
    fun `деньги месяца не задваиваются — четыре бесплатные поездки под пакетом дают цену пакета один раз`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(
                // Four free rides covered by the 399 ₽ package: money comes from the purchase, not ×4.
                ride(1, "2026-07-02", cost = 0),
                ride(2, "2026-07-03", cost = 0),
                ride(3, "2026-07-04", cost = 0),
                ride(4, "2026-07-05", cost = 0),
                ride(5, "2026-07-10", cost = 4200), // a paid ride — a direct charge, so it adds
            ),
            tariffs = listOf(
                tariff("2026-07-01", 39900), // one 399 ₽ package bought this month
                tariff("2026-06-20", 39900), // last month's package — not in July's total
            ),
        )

        val s = service.monthSummary()

        assertEquals(5, s.rides)
        // 399 ₽ (one July package) + 42 ₽ (a paid ride) = 44100 kopecks; NOT 4×399, and no June package.
        assertEquals(44100L, s.spentKopecks)
    }

    @Test
    fun `два пакета подряд в этом месяце учтены оба (деньги реальны, а не по атрибуции поездок)`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(ride(1, "2026-07-05", cost = 0), ride(2, "2026-07-06", cost = 0)),
            tariffs = listOf(
                tariff("2026-07-01", 39900),
                tariff("2026-07-02", 39900), // a second package bought right after — both are real
            ),
        )

        // Attribution hooks both rides to the nearest package, but money is counted by purchases: 2×399.
        assertEquals(79800L, service.monthSummary().spentKopecks)
    }

    @Test
    fun `нет поездок в этом месяце — сводка пустая (rides == 0)`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(ride(1, "2026-06-10")),
            tariffs = listOf(tariff("2026-07-01", 39900)),
        )

        val s = service.monthSummary()
        assertEquals(0, s.rides)
        assertEquals(0L, s.durationSeconds)
    }
}
