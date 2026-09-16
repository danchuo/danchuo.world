package world.danchuo.bike

import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

/**
 * Pure mapping of [RentItem] into [Ride] — no DB, no clock, so a unit test on a real fixture
 * covers it. API times are epoch millis, `distance` metres, `cost` kopecks. Station addresses
 * are set ONLY when non-null, or an update from the list would wipe a stored one.
 */
object RideMapper {

    /** Copies [item] onto [ride] (start/finish are already extracted and validated by the caller). */
    fun applyTo(ride: Ride, item: RentItem, start: Instant, finish: Instant, zone: ZoneId) {
        ride.externalId = item.id
        ride.startTime = start
        ride.finishTime = finish
        ride.rideDate = start.atZone(zone).toLocalDate()
        ride.distanceMeters = item.distance?.roundToInt() ?: 0
        ride.durationSeconds = item.duration ?: 0
        ride.calories = item.calories
        ride.costKopecks = item.cost
        ride.vehicleType = item.vehicleType
        ride.frameNumber = item.frameNumber
        ride.tariffName = item.tariffName
        ride.startLat = item.startBikeGeoPosition?.lat
        ride.startLon = item.startBikeGeoPosition?.lon
        ride.finishLat = item.finishBikeGeoPosition?.lat
        ride.finishLon = item.finishBikeGeoPosition?.lon
        item.startParkingAddress?.let { ride.startAddress = it }
        item.finishParkingAddress?.let { ride.finishAddress = it }
    }
}

/**
 * Pure mapping of [PurchaseItem] into [BikeTariff], keeping only `TARIFF` rows — `RENTAL` ones
 * are ride charges we already hold. `cost` is kopecks; the package minutes are best-effort from
 * the name and are not needed for display.
 */
object TariffMapper {

    /** Only a tariff purchase with a purchase time is storable — otherwise it has no time axis. */
    fun isTariffPurchase(item: PurchaseItem): Boolean =
        item.purchaseType.equals("TARIFF", ignoreCase = true) && item.createDate != null

    /** Copies [item] onto [tariff] (the caller has already checked [isTariffPurchase]). */
    fun applyTo(tariff: BikeTariff, item: PurchaseItem) {
        val orderItem = item.orderItems.firstOrNull { it.type.equals("tariff", ignoreCase = true) }
            ?: item.orderItems.firstOrNull()
        tariff.externalId = item.idPurchase.toString()
        tariff.purchasedAt = Instant.ofEpochMilli(item.createDate!!)
        tariff.priceKopecks = item.cost ?: orderItem?.cost ?: 0
        tariff.name = orderItem?.name
        tariff.minutes = orderItem?.name?.let(::parseMinutes)
    }

    /** "Access 60-minute package" gives 60; a per-minute access gives null. Diagnostics. */
    private fun parseMinutes(name: String): Int? =
        Regex("""(\d+)\s*мин""").find(name)?.groupValues?.get(1)?.toIntOrNull()
}

/** One ride's money: the access bought for it, and the package price it rides under. */
data class RideMoney(
    /** Price of the access bought for this ride (kopecks), or null when it bought none. */
    val accessKopecks: Int?,
    /** Price of the package a ride without its own access runs under (kopecks), or null. */
    val coveredByTariffKopecks: Int?,
)

/**
 * Who paid for which ride. Velobike charges in TWO records — the "access" purchase (entry into a
 * tariff) and the ride's own `cost` (what ran up beyond it) — and both are needed or the price
 * lies. Access goes to the one ride it was bought for; the rest are covered. PRD §7, §5.13
 */
object TariffAttribution {

    /** How late after a purchase the ride it was bought for may still start. */
    private const val OWN_WINDOW_SECONDS = 24L * 3600

    /** How old a purchase may be while still covering a ride that bought no access. */
    private const val COVER_WINDOW_SECONDS = 7L * 24 * 3600

    /** Purchase clocks may lag rental clocks — a small allowance in the other direction. */
    private const val CLOCK_GRACE_SECONDS = 120L

    /**
     * Spreads money across rides: ride `externalId` to [RideMoney]. Input order does not matter.
     * A ride with no matching purchase (history predating `bike_tariff`) gets an empty [RideMoney],
     * and the board shows it as before, off `cost` alone.
     */
    fun attribute(rides: List<Ride>, purchases: List<BikeTariff>): Map<Long, RideMoney> {
        val byStart = rides.sortedBy { it.startTime }
        val buys = purchases.sortedBy { it.purchasedAt }
        val accessOf = HashMap<Long, Int>()
        val taken = HashSet<Long>()

        for ((i, buy) in buys.withIndex()) {
            val kind = tariffKind(buy.name) ?: continue
            val nextBuy = buys.getOrNull(i + 1)?.purchasedAt
            val owner = byStart.firstOrNull { ride ->
                ride.externalId !in taken &&
                    matches(ride.tariffName, kind) &&
                    opensRide(buy.purchasedAt, ride.startTime, nextBuy)
            } ?: continue
            taken += owner.externalId
            if (buy.priceKopecks > 0) accessOf[owner.externalId] = buy.priceKopecks
        }

        return byStart.associate { ride ->
            val access = accessOf[ride.externalId]
            val covered = if (ride.externalId in taken) null else covering(ride, buys)
            ride.externalId to RideMoney(access, covered)
        }
    }

    /** "Access 60-minute package" to "60-minute package"; without the word "Access" a purchase
     *  cannot be recognised at all. */
    private fun tariffKind(purchaseName: String?): String? {
        val clean = normalize(purchaseName) ?: return null
        if (!clean.startsWith("доступ")) return null
        return clean.removePrefix("доступ").trim().takeIf { it.isNotEmpty() }
    }

    private fun normalize(name: String?): String? =
        name?.replace(Regex("""\s+"""), " ")?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    private fun matches(rideTariffName: String?, kind: String): Boolean = normalize(rideTariffName) == kind

    /** Per-minute access carries no included minutes — it can cover no following ride. */
    private fun isPerMinute(kind: String): Boolean = kind.startsWith("поминутн")

    /** An access opens a ride that starts right after the purchase and before the next one. */
    private fun opensRide(purchasedAt: Instant, rideStart: Instant, nextBuy: Instant?): Boolean {
        val delta = rideStart.epochSecond - purchasedAt.epochSecond
        if (delta < -CLOCK_GRACE_SECONDS || delta > OWN_WINDOW_SECONDS) return false
        return nextBuy == null || rideStart.isBefore(nextBuy)
    }

    /** The nearest preceding purchase of the same package — the one the ride runs under. */
    private fun covering(ride: Ride, buysAsc: List<BikeTariff>): Int? =
        buysAsc.lastOrNull { buy ->
            val kind = tariffKind(buy.name)
            if (kind == null || isPerMinute(kind)) return@lastOrNull false
            val age = ride.startTime.epochSecond - buy.purchasedAt.epochSecond
            age in 0..COVER_WINDOW_SECONDS && matches(ride.tariffName, kind)
        }?.priceKopecks?.takeIf { it > 0 }
}
