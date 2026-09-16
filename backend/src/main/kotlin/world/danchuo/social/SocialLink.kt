package world.danchuo.social

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * A social link (PRD §5.8, §7) — icon, caption, hyperlink. Data-driven: a new one is a new row.
 * Order within the block is [sortOrder]. [icon] is frontend static (the platform's pixel icon).
 */
@Entity
@Table(name = "social_link")
class SocialLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Machine code of the platform (`github`/`telegram`/...), for the default frontend icon. */
    @Column(nullable = false)
    lateinit var platform: String

    /** Human-readable link caption. */
    @Column(nullable = false)
    lateinit var name: String

    @Column(nullable = false)
    lateinit var url: String

    @Column
    var icon: String? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
