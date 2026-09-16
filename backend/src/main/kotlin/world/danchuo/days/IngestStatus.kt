package world.danchuo.days

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Data freshness: a singleton row (id [SINGLETON_ID], seeded by migration `0130`) holding when the
 * phone last reached ingest. Written from the single day write point, so it reflects the moment of
 * INTAKE rather than the last change to a day; [lastIngestAt] `null` = no intake yet. PRD §8
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
        /** The table's only row, addressed by a fixed key. */
        const val SINGLETON_ID: Short = 1
    }
}
