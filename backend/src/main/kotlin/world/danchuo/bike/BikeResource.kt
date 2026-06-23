package world.danchuo.bike

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Публичное чтение истории поездок Велобайка (PRD §9 B4). Всё на чтение, без токена (§3).
 *
 * - `GET /api/rides` — лента поездок (новые сверху).
 * - `GET /api/rides/stats` — агрегат («сколько накатал»).
 *
 * До первого ingest данных нет — штатное пустое состояние (пустой список / нулевой агрегат).
 */
@Path("/api/rides")
@Produces(MediaType.APPLICATION_JSON)
class BikeResource(
    private val service: BikeRideService,
) {

    @GET
    fun list(): List<RideView> = service.publicList()

    @GET
    @Path("/stats")
    fun stats(): RideStatsView = service.stats()
}
