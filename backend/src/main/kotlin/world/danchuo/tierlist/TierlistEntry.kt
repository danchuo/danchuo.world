package world.danchuo.tierlist

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/** One published tier list. The raw IP is never stored, only [visitorDayHash]. PRD §5.20, §11 */
@Entity
@Table(name = "tierlist_entry")
class TierlistEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "submitted_at", nullable = false)
    lateinit var submittedAt: Instant

    /** How the author asked to be shown; `null` means they left it blank. */
    @Column
    var nick: String? = null

    /** JSON of `{tier: [shirtId, …]}`, every tier present — see [TierlistPolicy]. */
    @Column(nullable = false)
    lateinit var placements: String

    @Column(name = "visitor_day_hash", nullable = false)
    lateinit var visitorDayHash: String

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false
}
