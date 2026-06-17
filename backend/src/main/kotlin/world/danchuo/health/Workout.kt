package world.danchuo.health

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate

/** Источник тренировки. Пока единственный — Apple Health (push с iOS-шортката). */
enum class WorkoutSource { APPLE_HEALTH }

/**
 * Одна тренировка дня (PRD §5.4, §7) — N к [world.danchuo.days.DayRecord] **по дате**
 * (плоская связь `date`, без JPA-отношения: слайсы расцеплены). Тренировка не каждый
 * день — это норма; за дату их может быть 0..N.
 *
 * [activeEnergyKcal]/[distanceMeters] nullable: метрика могла не прийти (§5.4, null ≠ 0).
 */
@Entity
@Table(name = "workout")
class Workout {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(nullable = false)
    lateinit var date: LocalDate

    @Column(nullable = false)
    lateinit var type: String

    @Column(name = "duration_minutes", nullable = false)
    var durationMinutes: Int = 0

    @Column(name = "active_energy_kcal")
    var activeEnergyKcal: Int? = null

    @Column(name = "distance_meters")
    var distanceMeters: Int? = null

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var source: WorkoutSource = WorkoutSource.APPLE_HEALTH
}
