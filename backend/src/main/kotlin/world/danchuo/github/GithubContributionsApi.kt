package world.danchuo.github

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * The public contribution-calendar fragment that the profile page draws its own grid with. It
 * returns HTML rather than JSON, since GitHub has no open API for these cells (the parsing lives
 * in [ContributionCalendarParser]). No Kotlin default parameters: the REST client ignores them.
 */
@RegisterRestClient(configKey = "github-contributions")
@Produces(MediaType.TEXT_HTML)
interface GithubContributionsApi {

    /** `GET /users/{login}/contributions` — a year of cells with tooltips, unauthenticated. */
    @GET
    @Path("/users/{login}/contributions")
    fun contributions(
        @PathParam("login") login: String,
        @HeaderParam("User-Agent") userAgent: String,
    ): String
}
