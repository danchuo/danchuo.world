package world.danchuo.days

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Свежесть данных (PRD §8, эра M5) — singleton-строка «когда телефон последний раз
 * достучался до ingest». Пишется из единой точки записи дня ([DayRecordService.upsert]),
 * поэтому отражает момент *приёма* (оба канала: health 12/18/24 и интерактивная дисциплина),
 * а не последнее изменение дня. Читается публичным `GET /api/freshness` для тихого
 * индикатора в UI; алерт об отвале шортката — бэклог (B5).
 *
 * Ровно одна строка (id = [SINGLETON_ID]) — сидится миграцией `0130`, [lastIngestAt]
 * `null` = «приёмов ещё не было».
 */
@Entity
@Table(name = "ingest_status")
class IngestStatus {

    @Id
    @Column(name = "id")
    var id: Short = SINGLETON_ID

    @Column(name = "last_ingest_at")
    var lastIngestAt: Instant? = null

    companion object {
        /** Единственная строка таблицы — адресуется фиксированным ключом. */
        const val SINGLETON_ID: Short = 1
    }
}
