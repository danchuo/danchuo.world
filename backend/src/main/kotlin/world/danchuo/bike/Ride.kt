package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * One Velobike ride, idempotent by [externalId], landing on the MSK start date so it shares a
 * board day with sleep and steps (§4). Poller and push ingest both write through
 * [BikeRideService.upsert], so the delivery channel never touches the model. PRD §7 (Ride)
 */
@Entity
@Table(name = "bike_ride")
class Ride {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Velobike rental id, the idempotency key (upsert is by it). */
    @Column(name = "external_id", nullable = false, unique = true)
    var externalId: Long = 0

    /** Start date in MSK (the data axis, §4) — the ride belongs to that board day. */
    @Column(name = "ride_date", nullable = false)
    lateinit var rideDate: LocalDate

    @Column(name = "start_time", nullable = false)
    lateinit var startTime: Instant

    @Column(name = "finish_time", nullable = false)
    lateinit var finishTime: Instant

    /** Distance in metres (the API sends a float, we store an integer). */
    @Column(name = "distance_meters", nullable = false)
    var distanceMeters: Int = 0

    @Column(name = "duration_seconds", nullable = false)
    var durationSeconds: Int = 0

    @Column(name = "calories")
    var calories: Int? = null

    /** Cost in kopecks (the API's `cost`; 0 means free under the tariff). */
    @Column(name = "cost_kopecks")
    var costKopecks: Int? = null

    /** Vehicle type: `OMNI_24`/`OMNI_23`/`OMNI_MECHANICAL`... — mechanical vs electric. */
    @Column(name = "vehicle_type")
    var vehicleType: String? = null

    @Column(name = "frame_number")
    var frameNumber: String? = null

    @Column(name = "tariff_name")
    var tariffName: String? = null

    @Column(name = "start_lat")
    var startLat: Double? = null

    @Column(name = "start_lon")
    var startLon: Double? = null

    @Column(name = "finish_lat")
    var finishLat: Double? = null

    @Column(name = "finish_lon")
    var finishLon: Double? = null

    /** Start/finish station addresses — they come only from the detailed `getPopulatedRent`. */
    @Column(name = "start_address")
    var startAddress: String? = null

    @Column(name = "finish_address")
    var finishAddress: String? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
