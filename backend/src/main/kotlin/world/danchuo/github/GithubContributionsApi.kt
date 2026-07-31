package world.danchuo.github

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Публичный фрагмент календаря вкладов GitHub — тот самый, которым страница профиля рисует
 * свою сетку. Отдаёт **HTML**, а не JSON: открытого API под эти клетки у GitHub нет
 * (разбор канала — во врезе [ContributionCalendarParser]).
 *
 * База — `quarkus.rest-client.github-contributions.url` (`https://github.com`).
 * Без Kotlin-дефолтов у параметров: REST-клиент их не поддерживает.
 */
@RegisterRestClient(configKey = "github-contributions")
@Produces(MediaType.TEXT_HTML)
interface GithubContributionsApi {

    /** `GET /users/{login}/contributions` — год клеток с подписями, без авторизации. */
    @GET
    @Path("/users/{login}/contributions")
    fun contributions(
        @PathParam("login") login: String,
        @HeaderParam("User-Agent") userAgent: String,
    ): String
}
