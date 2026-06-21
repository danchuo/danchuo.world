package world.danchuo.days

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Публичная свежесть данных (PRD §8, эра M5) — `GET /api/freshness` отдаёт момент
 * последнего приёма ingest для тихого индикатора в UI. Публично на чтение (§3): фильтр
 * `IngestAuthFilter` стережёт только `/api/ingest/…`. Без @Transactional — как и прочие
 * read-ресурсы слайса ([DaysResource]).
 */
@Path("/api/freshness")
@Produces(MediaType.APPLICATION_JSON)
class FreshnessResource(private val status: IngestStatusService) {

    @GET
    fun freshness(): FreshnessView = FreshnessView(status.lastIngestAt())
}
