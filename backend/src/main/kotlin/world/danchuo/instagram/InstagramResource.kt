package world.danchuo.instagram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение последнего поста (PRD §5.17): `GET /api/instagram/latest`.
 *
 * Аккаунт не подключён или пост ещё не забран — **204**, а не 404 и не пустой объект: плитка
 * должна отличать «показывать нечего» от поломки и молча не рисовать карточку (DESIGN §7).
 */
@Path("/api/instagram")
class InstagramResource(
    private val posts: InstagramPostRepository,
    private val storage: InstagramImageStorage,
) {

    @GET
    @Path("/latest")
    @Produces(MediaType.APPLICATION_JSON)
    fun latest(): Response {
        val post = posts.current() ?: return Response.noContent().build()
        return Response.ok(post.toView(storage)).build()
    }
}
