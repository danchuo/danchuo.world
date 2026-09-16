package world.danchuo.theme

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Public reads of waves, token-free like everything read-side (§3). `/api/theme/active` gives the
 * active wave's tokens and 404s when there is none, leaving the frontend on `globals.css` defaults
 * with no flash; `/api/themes` lists released waves for the switcher. DESIGN §10
 */
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
class ThemeResource(
    private val service: ThemeService,
) {

    @GET
    @Path("/theme/active")
    fun active(): Response {
        val active = service.active()
            ?: return Response.status(Response.Status.NOT_FOUND)
                .entity(mapOf("error" to "no_active_theme"))
                .build()
        return Response.ok(active).build()
    }

    @GET
    @Path("/themes")
    fun themes(): List<ThemeView> = service.released()
}
