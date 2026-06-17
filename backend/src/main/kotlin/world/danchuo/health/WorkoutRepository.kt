package world.danchuo.health

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.LocalDate

/**
 * Доступ к тренировкам. Health отдаёт **весь день** целиком, поэтому ingest за дату
 * — это полная замена набора ([replaceForDate]): идемпотентно, повтор не плодит дубли
 * (PRD §5.4, §12 M1 exit).
 */
@ApplicationScoped
class WorkoutRepository : PanacheRepository<Workout> {

    fun listByDate(date: LocalDate): List<Workout> = list("date", date)

    /** Полная замена тренировок дня: стираем прежние и кладём новые. */
    fun replaceForDate(date: LocalDate, workouts: List<Workout>) {
        delete("date", date)
        workouts.forEach { it.date = date; persist(it) }
    }
}
