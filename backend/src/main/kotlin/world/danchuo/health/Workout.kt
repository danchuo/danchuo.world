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

enum class WorkoutSource { APPLE_HEALTH }

/**
 * One workout of a day, linked to it by DATE (a flat `date`, no JPA relation, as slices stay
 * decoupled). Not every day has one, and that is normal — a date holds 0..N.
 * [activeEnergyKcal]/[distanceMeters] are nullable: the metric may not have arrived. PRD §5.4
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
