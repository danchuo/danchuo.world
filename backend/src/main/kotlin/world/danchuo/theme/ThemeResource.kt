package world.danchuo.theme

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение волн (PRD §5.9, §12 M4; DESIGN §10). Всё на чтение, без токена (§3).
 *
 * - `GET /api/theme/active` — токены активной волны (default); фронт инжектит их в `:root`.
 *   Нет активной волны ⇒ 404 — фронт остаётся на дефолтах `globals.css` (без вспышки).
 * - `GET /api/themes` — список выпущенных волн для переключателя (DESIGN §2.6).
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
