package world.danchuo.bike

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Публичное чтение истории поездок Велобайка (PRD §9 B4). Всё на чтение, без токена (§3).
 *
 * - `GET /api/rides` — лента поездок (новые сверху).
 * - `GET /api/rides/stats` — агрегат («сколько накатал»).
 * - `GET /api/rides/month-summary` — сводка за текущий календарный месяц (шапка модалки).
 * - `GET /api/rides/{id}/random-paths` — пачка придуманных веломаршрутов для кнопки в окне.
 *
 * До первого ingest данных нет — штатное пустое состояние (пустой список / нулевой агрегат).
 */
@Path("/api/rides")
@Produces(MediaType.APPLICATION_JSON)
class BikeResource(
    private val service: BikeRideService,
    private val randomPaths: RandomPathService,
) {

    @GET
    fun list(): List<RideView> = service.publicList()

    @GET
    @Path("/stats")
    fun stats(): RideStatsView = service.stats()

    @GET
    @Path("/month-summary")
    fun monthSummary(): RideMonthSummaryView = service.monthSummary()

    /**
     * Пачка придуманных путей между станциями поездки. Пустой список — штатный ответ и для
     * «графа нет», и для «станция вне графа», и для «поездка без координат»: кнопка в окне
     * тогда просто убирается. Отдельного признака доступности нет намеренно — одна форма ответа
     * вместо флага, который пришлось бы держать в синхроне с содержимым.
     */
    @GET
    @Path("/{id}/random-paths")
    fun randomPaths(@PathParam("id") id: Long): List<RandomPathView> {
        val ride = service.publicList().firstOrNull { it.id == id } ?: return emptyList()
        val start = point(ride.startLat, ride.startLon) ?: return emptyList()
        val finish = point(ride.finishLat, ride.finishLon) ?: return emptyList()
        // Поездка вернулась на ту же станцию (таких 4 из 57) — между точкой и ей же пути нет,
        // и рисуется петля вокруг станции, соразмерная самой поездке.
        return if (RandomPathGeometry.distanceMeters(start, finish) < SAME_STATION_METERS) {
            randomPaths.randomLoops(start, ride.distanceMeters)
        } else {
            randomPaths.randomPaths(start, finish)
        }
    }

    private fun point(lat: Double?, lon: Double?): GeoPoint? =
        if (lat != null && lon != null) GeoPoint(lat, lon) else null

    private companion object {
        /** Ближе этого станции считаются одной: координаты станций у Велобайка не идеально ровные. */
        const val SAME_STATION_METERS = 30.0
    }
}
