package world.danchuo.health

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Access to workouts. Health hands over the WHOLE day, so ingest for a date is a full replacement
 * of the set ([replaceForDate]): idempotent, and a repeat makes no duplicates (PRD §5.4).
 */
@ApplicationScoped
class WorkoutRepository : PanacheRepository<Workout> {

    fun listByDate(date: LocalDate): List<Workout> = list("date", date)

    /** Full replacement of a day's workouts: wipe the old ones, put the new ones. */
    fun replaceForDate(date: LocalDate, workouts: List<Workout>) {
        delete("date", date)
        workouts.forEach { it.date = date; persist(it) }
    }
}
