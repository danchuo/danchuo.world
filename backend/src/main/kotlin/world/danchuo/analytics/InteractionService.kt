package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Один клик из батча бикона (B2). Все поля «грязные» — валидируются на записи. */
data class ClickInput(
    val tileId: String? = null,
    val offsetXPct: Double? = null,
    val offsetYPct: Double? = null,
    val viewportW: Int? = null,
)

/** Потайловый агрегат хитмапы: клики уже **обрезаны** по вкладу одного посетителя (анти-абуз). */
data class HeatmapTile(
    val tileId: String?,
    val clicks: Int,
    val uniques: Int,
)

/** Сводка хитмапы для одной страницы за период (приватная вьюха владельца, B2). */
data class HeatmapView(
    val path: String,
    val from: String,
    val to: String,
    val totalClicks: Int,
    val tiles: List<HeatmapTile>,
)

/**
 * Логика хитмапы (PRD §5.11, B2). Симметрична [AnalyticsService], но про **клики по тайлам**.
 *
 * Защита публичного POST — эшелонированная (PRD §11): рейтлимит на IP (`RateLimitFilter`) +
 * жёсткая валидация на записи здесь (размер батча, длина `tileId`, координаты в [0,1]; брак
 * молча отбрасывается, не роняя батч) + **cap-вклада-на-чтении**: в агрегате один посетитель
 * (суточный хэш) добавляет в тайл не больше [visitorCap] кликов. Поэтому даже залитый спамом
 * визит не «перекрашивает» картину — данные совещательные, и устойчивая агрегация важнее блока.
 */
@ApplicationScoped
class InteractionService(
    private val repository: InteractionRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
    @param:ConfigProperty(name = "danchuo.analytics.heatmap.max-batch") private val maxBatch: Int,
    @param:ConfigProperty(name = "danchuo.analytics.heatmap.visitor-cap") private val visitorCap: Int,
) {

    /** Записать батч кликов. Брак (битые координаты/слишком длинный tileId) отбрасывается поэлементно. */
    @Transactional
    fun record(
        visitId: String?,
        path: String,
        clicks: List<ClickInput>,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ) {
        if (clicks.isEmpty()) return
        val hash = visitorHash.of(ip, userAgent ?: "")
        val isBot = bots.isBot(userAgent, acceptLanguage)
        val now = Instant.now(clock)

        clicks.asSequence()
            .take(maxBatch) // потолок батча — анти-абуз (длинный массив отрезаем, не падаем)
            .mapNotNull { sanitize(it) }
            .forEach { clean ->
                val event = InteractionEvent().apply {
                    this.occurredAt = now
                    this.path = path
                    this.tileId = clean.tileId
                    this.offsetXPct = clean.offsetXPct
                    this.offsetYPct = clean.offsetYPct
                    this.viewportW = clean.viewportW
                    this.visitorDayHash = hash
                    this.isBot = isBot
                    this.visitId = visitId
                }
                repository.persist(event)
            }
    }

    /**
     * Потайловый агрегат за период (полуинтервал дат MSK `[from, to]` включительно по дню).
     * Клики каждого посетителя в тайл обрезаются до [visitorCap] — спам одного визита не плывёт.
     */
    fun heatmap(path: String, from: LocalDate, to: LocalDate): HeatmapView {
        val zone: ZoneId = clock.zone
        val fromInstant = from.atStartOfDay(zone).toInstant()
        val toInstant = to.plusDays(1).atStartOfDay(zone).toInstant() // конец дня `to` включительно

        val events = repository.listForHeatmap(path, fromInstant, toInstant)
        val tiles = events
            .groupBy { it.tileId }
            .map { (tileId, group) ->
                // Cap-вклада: на каждого посетителя — не больше visitorCap кликов в этот тайл.
                val cappedClicks = group
                    .groupingBy { it.visitorDayHash }
                    .eachCount()
                    .values
                    .sumOf { minOf(it, visitorCap) }
                HeatmapTile(
                    tileId = tileId,
                    clicks = cappedClicks,
                    uniques = group.map { it.visitorDayHash }.distinct().size,
                )
            }
            .sortedByDescending { it.clicks }

        return HeatmapView(
            path = path,
            from = from.toString(),
            to = to.toString(),
            totalClicks = tiles.sumOf { it.clicks },
            tiles = tiles,
        )
    }

    /** Чистит один клик: длина `tileId` ≤ 64, координаты строго в [0,1] (иначе поле гасится). null ⇒ выбросить. */
    private fun sanitize(input: ClickInput): ClickInput? {
        val tileId = input.tileId?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_TILE_ID }
        val x = input.offsetXPct?.takeIf { it in 0.0..1.0 }
        val y = input.offsetYPct?.takeIf { it in 0.0..1.0 }
        val viewport = input.viewportW?.takeIf { it in 1..MAX_VIEWPORT }
        // Клик без тайла И без координат — пустышка, не пишем.
        if (tileId == null && x == null && y == null) return null
        return ClickInput(tileId = tileId, offsetXPct = x, offsetYPct = y, viewportW = viewport)
    }

    private companion object {
        const val MAX_TILE_ID = 64
        const val MAX_VIEWPORT = 100_000
    }
}
