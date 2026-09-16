package world.danchuo.days

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * One day, the data axis of the project: keyed by the unique MSK [date] and filled by several
 * slices through [DayRecordService] (genesis guard, `updatedAt`). NULL IS NOT 0 — every health
 * stat is nullable and 0 steps is a real zero, never collapse it in the model. PRD §5.4, §7
 */
@Entity
@Table(name = "day_record")
class DayRecord {

    @Id
    @Column(nullable = false)
    lateinit var date: LocalDate

    /** Day name (§5.2/§5.6): set or edited after the fact; `null` when unnamed. */
    @Column(name = "title")
    var title: String? = null

    // -- Apple Health (§5.4): nullable; null = no data, 0 = a real zero --
    @Column(name = "steps")
    var steps: Int? = null

    /** Sleep belongs to the DAY OF WAKING UP (PRD §4). */
    @Column(name = "sleep_minutes")
    var sleepMinutes: Int? = null

    @Column(name = "sleep_rem_minutes")
    var sleepRemMinutes: Int? = null

    @Column(name = "sleep_deep_minutes")
    var sleepDeepMinutes: Int? = null

    @Column(name = "sleep_light_minutes")
    var sleepLightMinutes: Int? = null

    @Column(name = "sleep_awake_minutes")
    var sleepAwakeMinutes: Int? = null

    /**
     * Measured "Journal" app minutes over the day's EVENING window (PRD §5.6). `null` means "not
     * measured" (a manual mark, or a day predating the channel) — which is not a zero. The item's
     * mark lives in `checklist_entry`: the measurement here, the decision there.
     */
    @Column(name = "journal_minutes")
    var journalMinutes: Int? = null

    /**
     * GitHub contributions for the day, as the profile calendar itself counts them (commits, PRs,
     * reviews, issues). `null` = the day was not collected, `0` = collected and empty, and the
     * difference is working — zero days are many. GitHub assigns the bucket, not us. PRD §5.4
     */
    @Column(name = "contributions")
    var contributions: Int? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
