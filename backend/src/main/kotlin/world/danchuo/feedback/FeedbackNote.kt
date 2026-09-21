package world.danchuo.feedback

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import world.danchuo.core.security.DeviceType
import java.time.Instant
import java.time.LocalDate

/**
 * A visitor's note to the author: up to three answers, an optional signature, and the board state
 * it was written from. Every answer is nullable and at least one is non-null — the form asks for
 * one or all. The raw IP is never stored, only [visitorDayHash]. PRD §5.19, §11
 */
@Entity
@Table(name = "feedback_note")
class FeedbackNote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "submitted_at", nullable = false)
    lateinit var submittedAt: Instant

    @Column(name = "liked_most")
    var likedMost: String? = null

    @Column(name = "would_change")
    var wouldChange: String? = null

    @Column(name = "missing_block")
    var missingBlock: String? = null

    /** How the visitor asked to be credited; `null` means they left it blank. */
    @Column
    var signature: String? = null

    @Column(nullable = false)
    lateinit var path: String

    /** The wave the board wore while writing — a note about colour is unreadable without it. */
    @Column(name = "wave_key")
    var waveKey: String? = null

    /** The day the board had selected; `null` when the note came from outside the board. */
    @Column(name = "selected_day")
    var selectedDay: LocalDate? = null

    @Enumerated(EnumType.STRING)
    @Column(name = "device_type", nullable = false)
    lateinit var deviceType: DeviceType

    @Column(name = "viewport_w")
    var viewportW: Int? = null

    @Column(name = "viewport_h")
    var viewportH: Int? = null

    @Column(name = "screen_w")
    var screenW: Int? = null

    @Column(name = "screen_h")
    var screenH: Int? = null

    @Column
    var language: String? = null

    /** The raw User-Agent: the browser and OS the owner asked to see. PRD §5.19 */
    @Column(name = "user_agent")
    var userAgent: String? = null

    @Column(name = "visitor_day_hash", nullable = false)
    lateinit var visitorDayHash: String

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false
}
