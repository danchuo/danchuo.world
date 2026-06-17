package world.danchuo.days

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Доступ к [DayRecord] по ключу-дате (LocalDate, MSK). Слайсы пишут не сюда напрямую,
 * а через [DayRecordService] — он держит инварианты (генезис-гард, `created/updatedAt`).
 */
@ApplicationScoped
class DayRecordRepository : PanacheRepositoryBase<DayRecord, LocalDate> {

    fun findByDate(date: LocalDate): DayRecord? = findById(date)
}
