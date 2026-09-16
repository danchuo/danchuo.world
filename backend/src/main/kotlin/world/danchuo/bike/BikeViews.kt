package world.danchuo.bike

/**
 * Public projections of the bike slice (PRD §9 B4). Read-only, no token (§3). We expose our own
 * model rather than Velobike's raw shape ([VelobikeApi]).
 */

/**
 * One ride for the feed and the day layer. Times are ISO-8601, the date is MSK (`ride_date`).
 * Only start and finish coordinates exist — the API returns no track, so the board draws 2 pins.
 */
data class RideView(
    val id: Long,
    val rideDate: String,
    val startTime: String,
    val finishTime: String,
    val distanceMeters: Int,
    val durationSeconds: Int,
    val calories: Int?,
    /**
     * What ran up BEYOND the access (kopecks, the API's `cost`): per-minute tariff time or a
     * package overrun. This is NOT the ride's full price — entering the tariff was paid by a
     * separate purchase ([accessKopecks]). null means no cost data. Formatting is the board's.
     */
    val costKopecks: Int?,
    /**
     * Price (kopecks) of the access bought FOR THIS RIDE: a paid per-minute start or a minute
     * package. With [costKopecks] it sums into [totalKopecks]. null means another ride paid for
     * the access, or the history holds no purchase at all (see [TariffAttribution]).
     */
    val accessKopecks: Int?,
    /**
     * Price (kopecks) of the package a ride runs under when it did NOT buy the access itself.
     * That money is already counted on the ride that bought it, so this field only explains the
     * line and stays OUT of [totalKopecks]. null when the ride bought its own access.
     */
    val coveredByTariffKopecks: Int?,
    /** What the ride actually cost: [accessKopecks] + [costKopecks]. null means no data. */
    val totalKopecks: Int?,
    val vehicleType: String?,
    val tariffName: String?,
    val startLat: Double?,
    val startLon: Double?,
    val finishLat: Double?,
    val finishLon: Double?,
    val startAddress: String?,
    val finishAddress: String?,
)

/**
 * Ride history aggregate for the summary tile. All sums are over stored rides; an empty (zero)
 * aggregate is the normal state before the first ingest, not an error.
 */
data class RideStatsView(
    val totalRides: Int,
    val totalDistanceMeters: Long,
    val totalDurationSeconds: Long,
    val totalCalories: Long,
    val longestRideMeters: Int,
    val firstRideDate: String?,
    val lastRideDate: String?,
)

/**
 * Current-month summary for the rides modal header. `spentKopecks` is money actually paid that
 * month — paid rides plus this month's package purchases, each counted once — not the sum of
 * ride prices, so four free rides under one package are that one package. PRD §7
 */
data class RideMonthSummaryView(
    /** Summary month as `YYYY-MM` (MSK), for the caption and for debugging. */
    val month: String,
    val rides: Int,
    val durationSeconds: Long,
    val spentKopecks: Long,
)
