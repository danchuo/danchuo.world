package world.danchuo.bike

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/** Доступ к поездкам — новые сверху (по времени старта). Идемпотентность — по [Ride.externalId]. */
@ApplicationScoped
class RideRepository : PanacheRepository<Ride> {

    fun byExternalId(externalId: Long): Ride? = find("externalId", externalId).firstResult()

    fun listOrderedDesc(): List<Ride> = listAll(Sort.by("startTime", Sort.Direction.Descending))

    /** Последние `limit` поездок (новые сверху) — для публичной ленты; хранятся все. */
    fun listRecent(limit: Int): List<Ride> =
        findAll(Sort.by("startTime", Sort.Direction.Descending)).page(0, limit).list()

    /** Самый большой `external_id` среди сохранённых — граница инкрементального поллинга. */
    fun maxExternalId(): Long? =
        find("ORDER BY externalId DESC").firstResult()?.externalId
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
