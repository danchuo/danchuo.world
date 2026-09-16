package world.danchuo.days

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Access to [DayRecord] by its date key (LocalDate, MSK). Slices do not write here directly but
 * through [DayRecordService], which holds the invariants (genesis guard, `created/updatedAt`).
 */
@ApplicationScoped
class DayRecordRepository : PanacheRepositoryBase<DayRecord, LocalDate> {

    fun findByDate(date: LocalDate): DayRecord? = findById(date)

    /** Records over the inclusive date range `[from, to]`, for the calendar aggregator. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<DayRecord> =
        list("date >= ?1 and date <= ?2", from, to)
}
