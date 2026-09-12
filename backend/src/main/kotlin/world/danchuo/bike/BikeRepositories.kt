package world.danchuo.bike

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant
import java.time.LocalDate

/** Доступ к поездкам — новые сверху (по времени старта). Идемпотентность — по [Ride.externalId]. */
@ApplicationScoped
class RideRepository : PanacheRepository<Ride> {

    fun byExternalId(externalId: Long): Ride? = find("externalId", externalId).firstResult()

    fun listOrderedDesc(): List<Ride> = listAll(Sort.by("startTime", Sort.Direction.Descending))

    /** Поездки начиная с даты [from] включительно (новые сверху) — публичная лента текущего года. */
    fun listFrom(from: LocalDate): List<Ride> =
        find("rideDate >= ?1", Sort.by("startTime", Sort.Direction.Descending), from).list()

    /** Самая свежая поездка (по времени старта) — фолбэк, когда в текущем году поездок ещё нет. */
    fun latest(): Ride? = findAll(Sort.by("startTime", Sort.Direction.Descending)).firstResult()

    /** Уникальные адреса станций (старт+финиш, без null) — для геокодинга точек ([StationGeocoder]). */
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
 * Кэш координат станций по адресу ([BikeStation]). Заполняется геокодером ([StationGeocoder]);
 * читается публичной лентой для отрисовки пинов по станции вместо сырого GPS.
 */
@ApplicationScoped
class BikeStationRepository : PanacheRepository<BikeStation> {

    fun byAddress(address: String): BikeStation? = find("address", address).firstResult()

    /** Все адреса, которые уже пробовали геокодировать (found или нет) — чтобы не ретраить. */
    fun knownAddresses(): Set<String> =
        getEntityManager().createQuery("select s.address from BikeStation s", String::class.java)
            .resultList.toSet()

    /** Адрес → координаты для успешно геокодированных станций (для подмены точек в проекции). */
    fun foundCoords(): Map<String, Pair<Double, Double>> =
        find("found = true and lat is not null and lon is not null").list()
            .associate { it.address to (it.lat!! to it.lon!!) }
}

/** Доступ к покупкам тарифов — новые сверху (по времени покупки). Идемпотентность — по [BikeTariff.externalId]. */
@ApplicationScoped
class BikeTariffRepository : PanacheRepository<BikeTariff> {

    fun byExternalId(externalId: String): BikeTariff? = find("externalId", externalId).firstResult()

    /** Все покупки, новые сверху — используются для привязки бесплатной поездки к предшествующей покупке. */
    fun listOrderedDesc(): List<BikeTariff> = listAll(Sort.by("purchasedAt", Sort.Direction.Descending))
}

/**
 * Доступ к синглтон-строке refresh-токена Велобайка ([VelobikeToken]). SMS-логин идемпотентен:
 * [save] — upsert по фиксированному id.
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
