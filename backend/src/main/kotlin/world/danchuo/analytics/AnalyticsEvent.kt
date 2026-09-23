package world.danchuo.analytics

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import world.danchuo.core.security.DeviceType

/**
 * A raw visit event. The raw IP is NEVER stored — only [visitorDayHash], which is what uniques
 * are counted by. Bot rows are kept as raw material but excluded from the summary. PRD §5.11
 */
@Entity
@Table(name = "analytics_event")
class AnalyticsEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "occurred_at", nullable = false)
    lateinit var occurredAt: Instant

    @Column(nullable = false)
    lateinit var path: String

    @Column(name = "visitor_day_hash", nullable = false)
    lateinit var visitorDayHash: String

    @Enumerated(EnumType.STRING)
    @Column(name = "device_type", nullable = false)
    lateinit var deviceType: DeviceType

    @Column
    var referrer: String? = null

    /** Host of [referrer], derived on write: sources group per site, not per link. */
    @Column(name = "referrer_host")
    var referrerHost: String? = null

    @Column(name = "utm_source")
    var utmSource: String? = null

    @Column(name = "utm_medium")
    var utmMedium: String? = null

    @Column(name = "utm_campaign")
    var utmCampaign: String? = null

    /** The wave the board wore at load; the visitor may switch it later in the visit. */
    @Column(name = "wave_key")
    var waveKey: String? = null

    @Column(name = "viewport_w")
    var viewportW: Int? = null

    @Column(name = "viewport_h")
    var viewportH: Int? = null

    /** Deepest scroll reached, 0..100; `null` until the follow-up arrives. */
    @Column(name = "scroll_pct")
    var scrollPct: Int? = null

    /** FOREGROUND time (ms): a backgrounded tab stops accruing. `null` until the follow-up. */
    @Column(name = "dwell_ms")
    var dwellMs: Int? = null

    /** Web Vitals as the browser settled them; `null` until a follow-up carries one. PRD §5.11 */
    @Column(name = "lcp_ms")
    var lcpMs: Int? = null

    @Column(name = "inp_ms")
    var inpMs: Int? = null

    /** CLS × 1000: the score is a fraction, the column an integer. */
    @Column(name = "cls_milli")
    var clsMilli: Int? = null

    @Column(name = "fcp_ms")
    var fcpMs: Int? = null

    @Column(name = "ttfb_ms")
    var ttfbMs: Int? = null

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false

    /** One visit, one row: the beacon's follow-ups merge here. Unique in `1080`. */
    @Column(name = "visit_id")
    var visitId: String? = null
}
