package world.danchuo.analytics

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Сырое событие клика для хитмапы (PRD §5.11, B2) — cookieless, без третьих сторон, своё
 * решение в Postgres. Сестринская сущность [AnalyticsEvent]: тот же приватно-аналитический
 * контур (сырой IP не хранится — только суточный хэш [visitorDayHash], боты метятся [isBot]).
 *
 * Модель **потайловая**, не пиксельная: храним, по какому тайлу борда кликнули ([tileId] —
 * машинный id из реестра фронта, напр. `today`/`music`), а координаты [offsetXPct]/[offsetYPct]
 * — **внутри** тайла (доля 0..1 от его bounding box). Это стабильно через все вьюпорты и волны
 * (адаптивный bento ломал бы сырые экранные пиксели), а внутритайловые доли позволяют позже
 * дорисовать пиксель-облачко *внутри* конкретной плитки, не завися от размера экрана.
 *
 * Клик вне любого тайла ⇒ [tileId] == null (учитывается как «мимо плиток»).
 */
@Entity
@Table(name = "interaction_event")
class InteractionEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "occurred_at", nullable = false)
    lateinit var occurredAt: Instant

    /** Страница, на которой случился клик (обычно `/`). */
    @Column(nullable = false)
    lateinit var path: String

    /** Машинный id тайла борда (`today`, `music`, …); `null` — клик мимо плиток. */
    @Column(name = "tile_id")
    var tileId: String? = null

    /** Доля X внутри bounding box тайла, 0..1; `null` — клик мимо плиток. */
    @Column(name = "offset_x_pct")
    var offsetXPct: Double? = null

    /** Доля Y внутри bounding box тайла, 0..1; `null` — клик мимо плиток. */
    @Column(name = "offset_y_pct")
    var offsetYPct: Double? = null

    /** Ширина вьюпорта в момент клика (px) — для будущего разреза по брейкпоинтам. */
    @Column(name = "viewport_w")
    var viewportW: Int? = null

    @Column(name = "visitor_day_hash", nullable = false)
    lateinit var visitorDayHash: String

    @Column(name = "is_bot", nullable = false)
    var isBot: Boolean = false

    /** Служебная корреляция с визитом бикона (клиентский UUID); может быть `null`. */
    @Column(name = "visit_id")
    var visitId: String? = null
}
