package world.danchuo.days

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped

/**
 * Access to the singleton [IngestStatus] row, addressed by the fixed [IngestStatus.SINGLETON_ID].
 * Migration `0130` seeds it, so it normally exists; [IngestStatusService] still does find-or-create
 * to survive a clean database in tests.
 */
@ApplicationScoped
class IngestStatusRepository : PanacheRepositoryBase<IngestStatus, Short> {

    fun singleton(): IngestStatus? = findById(IngestStatus.SINGLETON_ID)
}
