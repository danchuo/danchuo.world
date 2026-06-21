package world.danchuo.days

import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/**
 * Свежесть данных (PRD §8). Пишет [IngestStatusService.markIngest] из единой точки записи
 * дня ([DayRecordService.upsert]) — значит, любой успешный ingest (health/дисциплина)
 * двигает отметку. Читается публичным `GET /api/freshness` ([FreshnessResource]).
 *
 * Singleton-строка: find-or-create по фиксированному ключу, чтобы не зависеть от наличия
 * сид-строки (миграция `0130` её всё же создаёт).
 */
@ApplicationScoped
class IngestStatusService(private val repo: IngestStatusRepository) {

    /** Отметить момент приёма данных (вызывается внутри транзакции ingest). */
    fun markIngest(at: Instant) {
        val row = repo.singleton() ?: IngestStatus().also(repo::persist)
        row.lastIngestAt = at
    }

    /** Последний момент приёма; `null` = приёмов ещё не было. */
    fun lastIngestAt(): Instant? = repo.singleton()?.lastIngestAt
}
