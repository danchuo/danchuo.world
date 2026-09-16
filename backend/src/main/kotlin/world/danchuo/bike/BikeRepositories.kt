package world.danchuo.bike

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant
import java.time.LocalDate

/** Ride access, newest first by start time. Idempotency is by [Ride.externalId]. */
@ApplicationScoped
class RideRepository : PanacheRepository<Ride> {

    fun byExternalId(externalId: Long): Ride? = find("externalId", externalId).firstResult()

    fun listOrderedDesc(): List<Ride> = listAll(Sort.by("startTime", Sort.Direction.Descending))

    /** Rides from [from] inclusive, newest first — the public feed of the current year. */
    fun listFrom(from: LocalDate): List<Ride> =
        find("rideDate >= ?1", Sort.by("startTime", Sort.Direction.Descending), from).list()

    fun latest(): Ride? = findAll(Sort.by("startTime", Sort.Direction.Descending)).firstResult()

    /** Unique station addresses (start+finish, non-null) for geocoding ([StationGeocoder]). */
    fun distinctAddresses(): Set<String> {
        val em = getEntityManager()
        val starts = em.createQuery(
            "select distinct r.startAddress from Ride r where r.startAddress is not null", String::class.java,
        ).resultList
        val finishes = em.createQuery(
            "select distinct r.finishAddress from Ride r where r.finishAddress is not null", String::class.java,
        ).resultList
        return (starts + finishes).toSet()
    }
}

/**
 * Station coordinate cache keyed by address ([BikeStation]). Filled by [StationGeocoder]; read by
 * the public feed to draw pins at the station instead of the raw GPS fix.
 */
@ApplicationScoped
class BikeStationRepository : PanacheRepository<BikeStation> {

    fun byAddress(address: String): BikeStation? = find("address", address).firstResult()

    /** Every address already attempted (found or not), so nothing is retried. */
    fun knownAddresses(): Set<String> =
        getEntityManager().createQuery("select s.address from BikeStation s", String::class.java)
            .resultList.toSet()

    fun foundCoords(): Map<String, Pair<Double, Double>> =
        find("found = true and lat is not null and lon is not null").list()
            .associate { it.address to (it.lat!! to it.lon!!) }
}

/** Tariff purchase access, newest first by purchase time. Idempotency is by [BikeTariff.externalId]. */
@ApplicationScoped
class BikeTariffRepository : PanacheRepository<BikeTariff> {

    fun byExternalId(externalId: String): BikeTariff? = find("externalId", externalId).firstResult()

    fun listOrderedDesc(): List<BikeTariff> = listAll(Sort.by("purchasedAt", Sort.Direction.Descending))
}

/**
 * Access to the singleton Velobike refresh-token row ([VelobikeToken]). SMS login is idempotent:
 * [save] upserts by a fixed id.
 */
@ApplicationScoped
class VelobikeTokenRepository : PanacheRepositoryBase<VelobikeToken, Long> {

    fun current(): VelobikeToken? = findById(VelobikeToken.SINGLETON_ID)

    fun save(encryptedRefreshToken: String, externalId: String?) {
        val token = current() ?: VelobikeToken()
        token.encryptedRefreshToken = encryptedRefreshToken
        token.externalId = externalId
        token.updatedAt = Instant.now()
        persist(token)
    }
}
