package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate

/** Сводка за один день (PRD §5.11): заходы, уники, среднее время на странице. */
data class AnalyticsDailySummary(
    val date: String,
    val visits: Int,
    val uniques: Int,
    val avgDwellMs: Int?,
)

/**
 * Логика аналитики (PRD §5.11). Запись бикона — идемпотентна по визиту: load-строка
 * создаётся, добивка `dwellMs` обновляет её по [AnalyticsEvent.visitId] (а не плодит дубль).
 * Сводка считается в памяти (трафик мал, §5.11): группировка по дате MSK, боты исключены.
 */
@ApplicationScoped
class AnalyticsService(
    private val repository: AnalyticsRepository,
    private val visitorHash: VisitorHash,
    private val bots: BotHeuristics,
    private val clock: Clock,
) {

    /** Записать событие бикона. [dwellMs] != null + известный [visitId] ⇒ добивка существующей строки. */
    @Transactional
    fun record(
        visitId: String?,
        path: String,
        dwellMs: Int?,
        referrer: String?,
        ip: String,
        userAgent: String?,
        acceptLanguage: String?,
    ) {
        // Добивка времени: находим load-строку этого визита и дописываем dwell.
        if (dwellMs != null && visitId != null) {
            val existing = repository.findByVisitId(visitId)
            if (existing != null) {
                existing.dwellMs = dwellMs
                return
            }
        }

        val event = AnalyticsEvent().apply {
            this.occurredAt = Instant.now(clock)
            this.path = path
            this.visitorDayHash = visitorHash.of(ip, userAgent ?: "")
            this.deviceType = bots.deviceType(userAgent)
            this.referrer = referrer
            this.dwellMs = dwellMs
            this.isBot = bots.isBot(userAgent, acceptLanguage)
            this.visitId = visitId
        }
        repository.persist(event)
    }

    /** Приватная сводка по дням (заходы/уники/среднее время), боты исключены. */
    fun summary(): List<AnalyticsDailySummary> {
        val zone = clock.zone
        return repository.listAll()
            .filter { !it.isBot }
            .groupBy { it.occurredAt.atZone(zone).toLocalDate() }
            .toSortedMap()
            .map { (date: LocalDate, events) ->
                val dwells = events.mapNotNull { it.dwellMs }
                AnalyticsDailySummary(
                    date = date.toString(),
                    visits = events.size,
                    uniques = events.map { it.visitorDayHash }.distinct().size,
                    avgDwellMs = if (dwells.isEmpty()) null else dwells.average().toInt(),
                )
            }
    }
}
