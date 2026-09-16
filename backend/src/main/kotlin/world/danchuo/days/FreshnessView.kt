package world.danchuo.days

import java.time.Instant

/**
 * Data freshness projection (PRD §8) for the quiet indicator in the UI. [lastIngestAt] `null`
 * means no ingest has happened yet, and the board shows nothing.
 */
data class FreshnessView(val lastIngestAt: Instant?)
