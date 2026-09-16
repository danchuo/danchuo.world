package world.danchuo.days

import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/**
 * Data freshness (PRD §8): [markIngest] is called from the single day write point, so any
 * successful ingest moves the mark, and [FreshnessResource] reads it. Find-or-create on a fixed
 * key, so it does not depend on the seed row existing (migration `0130` creates it anyway).
 */
@ApplicationScoped
class IngestStatusService(private val repo: IngestStatusRepository) {

    /** Marks the moment data was ingested (called inside the ingest transaction). */
    fun markIngest(at: Instant) {
        val row = repo.singleton() ?: IngestStatus().also(repo::persist)
        row.lastIngestAt = at
    }

    fun lastIngestAt(): Instant? = repo.singleton()?.lastIngestAt
}
