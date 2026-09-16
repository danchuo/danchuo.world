package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * One Velobike tariff purchase, idempotent by [externalId] (the payment id). It exists so a ride
 * costing `0` reads as "within a tariff of N" rather than "free"; it is never shown as a tile of
 * its own. PRD §7 (BikeTariff), §5.13
 */
@Entity
@Table(name = "bike_tariff")
class BikeTariff {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Velobike purchase id, the idempotency key. A string because the order id need not be
     *  numeric; with no stable id from the API the caller synthesises one from the timestamp. */
    @Column(name = "external_id", nullable = false, unique = true)
    lateinit var externalId: String

    /** Purchase moment: a ride is tied to the nearest purchase with `purchasedAt <=` its start. */
    @Column(name = "purchased_at", nullable = false)
    lateinit var purchasedAt: Instant

    /** Amount paid in kopecks (canonical; conversion from the API shape lives in the mapper). */
    @Column(name = "price_kopecks", nullable = false)
    var priceKopecks: Int = 0

    @Column(name = "name")
    var name: String? = null

    /** The tariff's minute package when the API gives one (diagnostics; not needed for display). */
    @Column(name = "minutes")
    var minutes: Int? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
