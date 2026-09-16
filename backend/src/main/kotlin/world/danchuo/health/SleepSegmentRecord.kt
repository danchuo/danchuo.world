package world.danchuo.health

import io.quarkus.cache.CacheInvalidateAll
import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * A raw night segment exactly as HealthKit sent it, tied to the day by WAKING date (flat link, no
 * JPA relation). Overlaps and duplicate sources are NOT resolved here — [SleepSessionizer] does
 * that on read, so the parsing rule can change without losing history. PRD §5.4 (I-23)
 */
@Entity
@Table(name = "sleep_segment")
class SleepSegmentRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Waking day (§4): the chunk belongs to the night someone woke up from on that day. */
    @Column(name = "wake_date", nullable = false)
    lateinit var wakeDate: LocalDate

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    lateinit var stage: SleepStage

    @Column(name = "started_at", nullable = false)
    lateinit var startedAt: Instant

    @Column(name = "ended_at", nullable = false)
    lateinit var endedAt: Instant
}

/**
 * Access to a night's chunks. Ingest for a date is a FULL REPLACEMENT of the set
 * ([replaceForWakeDate]): idempotent, so a repeated run makes no duplicates, as with workouts.
 */
@ApplicationScoped
class SleepSegmentRepository : PanacheRepository<SleepSegmentRecord> {

    fun listByWakeDate(date: LocalDate): List<SleepSegmentRecord> =
        list("wakeDate", date)

    /**
     * Full replacement of a night's chunks. Drops the whole night-detail cache: one night also
     * moves the "typical night" profile of thirty neighbours, and targeted invalidation would
     * cost more than the recomputation.
     */
    @CacheInvalidateAll(cacheName = "sleep-night")
    fun replaceForWakeDate(date: LocalDate, segments: List<SleepSegment>) {
        delete("wakeDate", date)
        segments.forEach { segment ->
            persist(
                SleepSegmentRecord().apply {
                    wakeDate = date
                    stage = segment.stage
                    startedAt = segment.start
                    endedAt = segment.end
                },
            )
        }
    }
}
