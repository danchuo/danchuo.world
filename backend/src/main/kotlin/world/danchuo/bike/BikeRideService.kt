package world.danchuo.bike

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class UpsertResult(val created: Int, val updated: Int)

/**
 * Where the external API's raw shape ([RentItem]) becomes our [Ride]. Idempotency is by
 * [Ride.externalId], so a repeat updates the row instead of duplicating it. Station addresses
 * arrive only from the detailed call, so an update must NEVER null out a stored one. PRD §9 B4
 */
@ApplicationScoped
class BikeRideService(
    private val rides: RideRepository,
    private val tariffs: BikeTariffRepository,
    private val stations: BikeStationRepository,
    private val clock: Clock,
) {

    /**
     * Idempotently writes a batch of rides. Unfinished ones, and ones without times, are skipped:
     * only rides that actually happened enter the history. Returns the new/updated counters.
     */
    @Transactional
    fun upsert(items: List<RentItem>): UpsertResult {
        var created = 0
        var updated = 0
        for (item in items) {
            val start = item.startTime ?: continue
            val finish = item.finishTime ?: continue
            val existing = rides.byExternalId(item.id)
            val ride = existing ?: Ride().apply { createdAt = Instant.now(clock) }
            RideMapper.applyTo(ride, item, Instant.ofEpochMilli(start), Instant.ofEpochMilli(finish), clock.zone)
            ride.updatedAt = Instant.now(clock)
            if (existing == null) {
                rides.persist(ride)
                created++
            } else {
                updated++
            }
        }
        return UpsertResult(created, updated)
    }

    /**
     * Idempotently writes tariff purchases, taking only `TARIFF` rows out of the mixed history —
     * `RENTAL` rows are ride charges we already hold. An "access" purchase is the entry into a
     * tariff, and without it a ride's price is incomplete ([TariffAttribution]).
     */
    @Transactional
    fun upsertTariffs(items: List<PurchaseItem>): UpsertResult {
        var created = 0
        var updated = 0
        for (item in items) {
            if (!TariffMapper.isTariffPurchase(item)) continue
            val existing = tariffs.byExternalId(item.idPurchase.toString())
            val tariff = existing ?: BikeTariff().apply { createdAt = Instant.now(clock) }
            TariffMapper.applyTo(tariff, item)
            tariff.updatedAt = Instant.now(clock)
            if (existing == null) {
                tariffs.persist(tariff)
                created++
            } else {
                updated++
            }
        }
        return UpsertResult(created, updated)
    }

    /**
     * Public feed: rides of the current calendar year (MSK), newest first — the season hugs
     * summer, so the axis is the year rather than a count. With no ride yet this year, the single
     * latest one is shown so the tile is not empty. Money is split by [TariffAttribution].
     */
    fun publicList(): List<RideView> {
        val startOfYear = LocalDate.now(clock).withDayOfYear(1)
        val thisYear = rides.listFrom(startOfYear)
        val chosen = thisYear.ifEmpty { listOfNotNull(rides.latest()) }
        // Money is counted over the WHOLE history, not the visible slice: the access may have been
        // bought by a package neighbour outside the year, and the ride would claim someone else's.
        val money = TariffAttribution.attribute(rides.listOrderedDesc(), tariffs.listOrderedDesc())
        val stationCoords = stations.foundCoords()
        return chosen.map { toView(it, money, stationCoords) }
    }


    /**
     * Summary of the current calendar month (MSK). Money is what was ACTUALLY PAID that month —
     * paid rides plus this month's tariff purchases, each counted exactly once — so free rides
     * under one package never multiply the sum. PRD §7 (RideMonthSummaryView)
     */
    fun monthSummary(): RideMonthSummaryView {
        val zone = clock.zone
        val monthStart = LocalDate.now(clock).withDayOfMonth(1)
        val nextMonthStart = monthStart.plusMonths(1)
        val monthRides = rides.listFrom(monthStart).filter { it.rideDate.isBefore(nextMonthStart) }
        // Money = direct charges for paid rides + this month's package purchases, one per real
        // purchase record — so four free rides under one package do not bill 4x.
        val paidKopecks = monthRides.sumOf { (it.costKopecks ?: 0).coerceAtLeast(0).toLong() }
        val tariffKopecks = tariffs.listOrderedDesc()
            .filter { it.purchasedAt.atZone(zone).toLocalDate().let { d -> !d.isBefore(monthStart) && d.isBefore(nextMonthStart) } }
            .sumOf { it.priceKopecks.toLong() }
        return RideMonthSummaryView(
            month = monthStart.toString().substring(0, 7),
            rides = monthRides.size,
            durationSeconds = monthRides.sumOf { it.durationSeconds.toLong() },
            spentKopecks = paidKopecks + tariffKopecks,
        )
    }

    /** History aggregate for the summary tile — over the WHOLE history, not the visible year. */
    fun stats(): RideStatsView {
        val all = rides.listOrderedDesc()
        if (all.isEmpty()) return RideStatsView(0, 0, 0, 0, 0, null, null)
        return RideStatsView(
            totalRides = all.size,
            totalDistanceMeters = all.sumOf { it.distanceMeters.toLong() },
            totalDurationSeconds = all.sumOf { it.durationSeconds.toLong() },
            totalCalories = all.sumOf { (it.calories ?: 0).toLong() },
            longestRideMeters = all.maxOf { it.distanceMeters },
            firstRideDate = all.minByOrNull { it.startTime }!!.rideDate.toString(),
            lastRideDate = all.maxByOrNull { it.startTime }!!.rideDate.toString(),
        )
    }

    private fun toView(
        r: Ride,
        money: Map<Long, RideMoney>,
        stationCoords: Map<String, Pair<Double, Double>>,
    ): RideView {
        // The station point (by address) beats the bike's raw GPS; GPS is the fallback.
        val start = r.startAddress?.let { stationCoords[it] }
        val finish = r.finishAddress?.let { stationCoords[it] }
        val paid = money[r.externalId] ?: RideMoney(null, null)
        val access = paid.accessKopecks
        return RideView(
            id = r.id!!,
            rideDate = r.rideDate.toString(),
            startTime = ISO.format(r.startTime),
            finishTime = ISO.format(r.finishTime),
            distanceMeters = r.distanceMeters,
            durationSeconds = r.durationSeconds,
            calories = r.calories,
            costKopecks = r.costKopecks,
            accessKopecks = access,
            coveredByTariffKopecks = paid.coveredByTariffKopecks,
            totalKopecks = if (access == null && r.costKopecks == null) null else (access ?: 0) + (r.costKopecks ?: 0),
            vehicleType = r.vehicleType,
            tariffName = r.tariffName,
            startLat = start?.first ?: r.startLat,
            startLon = start?.second ?: r.startLon,
            finishLat = finish?.first ?: r.finishLat,
            finishLon = finish?.second ?: r.finishLon,
            startAddress = r.startAddress,
            finishAddress = r.finishAddress,
        )
    }

    private companion object {
        val ISO: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT
    }
}
