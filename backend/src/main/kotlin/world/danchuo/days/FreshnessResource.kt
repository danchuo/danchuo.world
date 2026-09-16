package world.danchuo.days

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Public data freshness: `GET /api/freshness` gives the moment of the last ingest for the quiet
 * indicator in the UI. Public like every read (§3) — `IngestAuthFilter` guards only the ingest
 * paths. No `@Transactional`, same as the slice's other read resources. PRD §8
 */
@Path("/api/freshness")
@Produces(MediaType.APPLICATION_JSON)
class FreshnessResource(private val status: IngestStatusService) {

    @GET
    fun freshness(): FreshnessView = FreshnessView(status.lastIngestAt())
}
