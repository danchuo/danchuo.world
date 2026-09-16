package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Cache of a Velobike station's coordinates, keyed by its address, one row per address. [found]
 * false marks an address already tried without a match, so the geocoder is never hammered again.
 * Why we geocode at all instead of trusting the bike's GPS: PRD §7 (BikeStation).
 */
@Entity
@Table(name = "bike_station")
class BikeStation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Station address exactly as Velobike sent it — the cache key. */
    @Column(name = "address", nullable = false, unique = true)
    lateinit var address: String

    /** Station coordinates from the geocoder; null when [found] is false. */
    @Column(name = "lat")
    var lat: Double? = null

    @Column(name = "lon")
    var lon: Double? = null

    /** Whether the address geocoded. false means we already tried and found no match — no retry. */
    @Column(name = "found", nullable = false)
    var found: Boolean = false

    @Column(name = "geocoded_at", nullable = false)
    lateinit var geocodedAt: Instant
}
