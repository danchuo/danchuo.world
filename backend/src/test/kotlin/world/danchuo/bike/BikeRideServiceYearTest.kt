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

    /** Покупки тарифов в памяти — новые сверху (как реальный [BikeTariffRepository.listOrderedDesc]). */
    private class FakeTariffRepo(private val all: List<BikeTariff>) : BikeTariffRepository() {
        override fun listOrderedDesc(): List<BikeTariff> = all.sortedByDescending { it.purchasedAt }
    }

    /** Кэш координат станций в памяти — адрес → координаты (как [BikeStationRepository.foundCoords]). */
    private class FakeStationRepo(private val coords: Map<String, Pair<Double, Double>>) : BikeStationRepository() {
        override fun foundCoords(): Map<String, Pair<Double, Double>> = coords
    }

    private fun ride(id: Long, date: String, cost: Int? = null, duration: Int = 600): Ride = Ride().apply {
        this.id = id
        externalId = id
        rideDate = LocalDate.parse(date)
        startTime = Instant.parse("${date}T10:00:00Z")
        finishTime = startTime.plusSeconds(duration.toLong())
        distanceMeters = 1000
        durationSeconds = duration
        costKopecks = cost
        createdAt = startTime
        updatedAt = startTime
    }

    private fun tariff(date: String, kopecks: Int): BikeTariff = BikeTariff().apply {
        externalId = "t-$date"
        purchasedAt = Instant.parse("${date}T09:00:00Z")
        priceKopecks = kopecks
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

    @Test
    fun `точка рисуется по станции (по адресу), сырой GPS — фолбэк без станции`() {
        val ride = ride(1, "2026-07-05").apply {
            startAddress = "метро Кунцевская"
            startLat = 55.95; startLon = 37.42 // «улетевший» GPS (Шереметьево) — должен быть перекрыт
            finishAddress = "ст. м. Молодёжная (выход № 2)" // станции в кэше нет ⇒ остаётся GPS
            finishLat = 55.74; finishLon = 37.42
        }
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(ride),
            stationCoords = mapOf("метро Кунцевская" to (55.7305 to 37.4460)), // настоящая станция
        )

        val out = service.publicList().single()

        assertEquals(55.7305, out.startLat) // взято со станции, не с GPS-заброса
        assertEquals(37.4460, out.startLon)
        assertEquals(55.74, out.finishLat) // финиш-станции в кэше нет ⇒ фолбэк на GPS
    }

    @Test
    fun `бесплатная поездка в проекции несёт цену покрывающего тарифа, платная — нет`() {
        val service = serviceAt(
            today = "2026-07-10",
            rides = listOf(
                ride(1, "2026-07-05", cost = 0), // бесплатная — под пакетом, купленным 07-01
                ride(2, "2026-07-06", cost = 5243), // платная — тариф не подтягивается
            ),
            tariffs = listOf(tariff("2026-07-01", 39900)),
        )

        val out = service.publicList().associateBy { it.rideDate }

        assertEquals(39900, out["2026-07-05"]!!.coveredByTariffKopecks)
        assertEquals(null, out["2026-07-06"]!!.coveredByTariffKopecks)
    }

    @Test
    fun `сводка месяца — только текущий календарный месяц (MSK), поездки и минуты`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(
                ride(1, "2026-06-30", duration = 900), // прошлый месяц — не в счёт
                ride(2, "2026-07-02", duration = 600), // 10 мин
                ride(3, "2026-07-14", duration = 1200), // 20 мин
            ),
        )

        val s = service.monthSummary()

        assertEquals("2026-07", s.month)
        assertEquals(2, s.rides)
        assertEquals(1800L, s.durationSeconds) // 600 + 1200, июньская не учтена
    }

    @Test
    fun `деньги месяца не задваиваются — четыре бесплатные поездки под пакетом дают цену пакета один раз`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(
                // Четыре бесплатные поездки «в рамках тарифа за 399 ₽» — деньги берём из покупки, не ×4.
                ride(1, "2026-07-02", cost = 0),
                ride(2, "2026-07-03", cost = 0),
                ride(3, "2026-07-04", cost = 0),
                ride(4, "2026-07-05", cost = 0),
                ride(5, "2026-07-10", cost = 4200), // платная поездка — прямое списание, добавляется
            ),
            tariffs = listOf(
                tariff("2026-07-01", 39900), // один купленный пакет 399 ₽ в этом месяце
                tariff("2026-06-20", 39900), // пакет прошлого месяца — в сумму июля не входит
            ),
        )

        val s = service.monthSummary()

        assertEquals(5, s.rides)
        // 399 ₽ (один июльский пакет) + 42 ₽ (платная поездка) = 44100 коп; НЕ 4×399 и без июньского пакета.
        assertEquals(44100L, s.spentKopecks)
    }

    @Test
    fun `два пакета подряд в этом месяце учтены оба (деньги реальны, а не по атрибуции поездок)`() {
        val service = serviceAt(
            today = "2026-07-16",
            rides = listOf(ride(1, "2026-07-05", cost = 0), ride(2, "2026-07-06", cost = 0)),
            tariffs = listOf(
                tariff("2026-07-01", 39900),
                tariff("2026-07-02", 39900), // второй пакет куплен подряд — обе покупки реальны
            ),
        )

        // Атрибуция цепляет обе поездки к ближайшему пакету, но деньги считаем по покупкам: 2×399.
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
