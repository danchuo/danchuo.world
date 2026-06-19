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

/** Тип устройства посетителя — выводится из User-Agent (PRD §7). */
enum class DeviceType { MOBILE, TABLET, DESKTOP }

/**
 * Сырое событие посещения (PRD §5.11, §7) — своё решение в Postgres, без третьих сторон,
 * cookieless. **Сырой IP не хранится**: только суточный хэш [visitorDayHash]
 * (`sha256(ip+ua+соль+дата)`, соль ротируется ежедневно) — уник считается по нему.
 *
 * [dwellMs] доезжает добивкой бикона (`visibilitychange`/выгрузка) — коррелируем с load-строкой
 * по служебному [visitId]. Боты помечаются [isBot] и исключаются из сводки (сырьё хранится §5.11).
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

    /** Время на странице (мс) из бикона; `null` до прихода добивки. */
    @Column(name = "dwell_ms")
    var dwellMs: Int? = null

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false

    /** Служебная корреляция load↔dwell одной сессии-визита (клиентский UUID). */
    @Column(name = "visit_id")
    var visitId: String? = null
}
