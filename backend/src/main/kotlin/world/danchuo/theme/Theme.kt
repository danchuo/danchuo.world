package world.danchuo.theme

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant

/**
 * A wave — a named visual style whose values live in [tokens] (JSONB) and are injected into
 * `:root` by the frontend, so switching waves restyles the site WITHOUT touching components.
 * Data-driven, exactly one [active]. Tokens hold palette only; fonts come from `next/font`.
 */
@Entity
@Table(name = "theme")
class Theme {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Stable machine key of the wave (`wave-01`), unique. */
    @Column(nullable = false, unique = true)
    lateinit var key: String

    @Column(nullable = false)
    lateinit var name: String

    /** The wave's design tokens, `{ "bg-page": "#faf1eb", … }`, serialised into jsonb. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    lateinit var tokens: Map<String, String>

    /**
     * The wave's layout block, overriding the frontend's default bento. `null` means the frontend
     * takes the `layout.ts` default. The backend stores it as opaque JSON and never interprets it.
     * DESIGN §3, §10
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    var layout: LayoutSpec? = null

    /** Exactly one wave is active — the display default. */
    @Column(nullable = false)
    var active: Boolean = false

    /** When the wave was released; the switcher shows released ones only. */
    @Column(name = "released_at", nullable = false)
    lateinit var releasedAt: Instant
}
