package world.danchuo.bike

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Raw DTOs mirroring the Velobike API, recovered by reverse-engineering its mobile app. Only the
 * fields we need; the rest is ignored, since someone else's contract may grow and must not break
 * parsing. Mapping into our [Ride] happens in [BikeRideService].
 */

/** History page: `GET /api/rent/rents/client?size=&page=&statuses=TECH_DONE,DONE` (Spring Page). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class RentPage(
    val content: List<RentItem> = emptyList(),
    val totalElements: Int = 0,
    val totalPages: Int = 0,
    val number: Int = 0,
    val last: Boolean = true,
)

/** One ride from history. Times are epoch millis; `distance` metres (float); `cost` kopecks. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class RentItem(
    val id: Long,
    val status: String? = null,
    val startTime: Long? = null,
    val finishTime: Long? = null,
    val distance: Double? = null,
    val duration: Int? = null,
    val calories: Int? = null,
    val cost: Int? = null,
    val vehicleType: String? = null,
    val frameNumber: String? = null,
    val tariffName: String? = null,
    val startBikeGeoPosition: GeoPosition? = null,
    val finishBikeGeoPosition: GeoPosition? = null,
    // Only from the detailed getPopulatedRent:
    val startParkingAddress: String? = null,
    val finishParkingAddress: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeoPosition(
    val lat: Double? = null,
    val lon: Double? = null,
)

/**
 * Purchase-history page: `GET /api/purchases/history?size=&page=` (Spring Page). It mixes two
 * kinds by [PurchaseItem.purchaseType]: `TARIFF`, which we need to attribute free rides, and
 * `RENTAL`, a charge for one ride, which we already hold.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchasePage(
    val content: List<PurchaseItem> = emptyList(),
    val totalElements: Int = 0,
    val number: Int = 0,
    val last: Boolean = true,
)

/**
 * One purchase-history record. `cost` is kopecks, `createDate` the epoch millis of the purchase.
 * Name and minutes come out of [orderItems].
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchaseItem(
    val idPurchase: Long,
    val purchaseType: String? = null,
    val cost: Int? = null,
    val createDate: Long? = null,
    val orderItems: List<PurchaseOrderItem> = emptyList(),
)

/** A purchase line: `type` is `tariff`/`rental`, `name` is the human-readable label. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchaseOrderItem(
    val type: String? = null,
    val name: String? = null,
    val cost: Int? = null,
)

/**
 * Reply of `POST /api/api-auth/client-authenticate` (body `{user: phone, password: SMS code}`).
 * `access_token` is a 24h JWT, `refresh_token` a ~6-month one stored encrypted; the supabase
 * token is for a separate backend and the slice does not need it.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class VelobikeAuthResponse(
    val access_token: String? = null,
    val refresh_token: String? = null,
)

/** Reply of `POST /api/api-auth/code/{phone}` — the SMS code request. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class VelobikeCodeResponse(
    val authParameters: CodeParams? = null,
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    data class CodeParams(val expiresIn: Int? = null, val length: Int? = null, val retriesIn: Int? = null)
}
