package world.danchuo.bike

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Public reads of the Velobike ride history, token-free (§3). Before the first ingest the
 * answers are an empty list and a zero aggregate — a normal state, not an error. PRD §9 B4
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

    @GET
    @Path("/month-summary")
    fun monthSummary(): RideMonthSummaryView = service.monthSummary()
}
