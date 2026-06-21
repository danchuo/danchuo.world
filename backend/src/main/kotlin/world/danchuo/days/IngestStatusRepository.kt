package world.danchuo.days

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped

/**
 * Доступ к singleton-строке [IngestStatus]. Адресуется фиксированным ключом
 * [IngestStatus.SINGLETON_ID] — строка сидится миграцией `0130`, так что обычно уже есть;
 * [IngestStatusService] всё равно делает find-or-create (устойчивость к чистой БД в тестах).
 */
@ApplicationScoped
class IngestStatusRepository : PanacheRepositoryBase<IngestStatus, Short> {

    fun singleton(): IngestStatus? = findById(IngestStatus.SINGLETON_ID)
}
