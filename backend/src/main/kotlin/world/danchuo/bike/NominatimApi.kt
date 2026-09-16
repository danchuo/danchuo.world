package world.danchuo.bike

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * REST client for the OSM Nominatim geocoder (see [StationGeocoder]). Its usage policy requires
 * an identifying `User-Agent`, which we pass from config; a unique address is geocoded once and
 * cached, so the load stays within that policy.
 */
@RegisterRestClient(configKey = "nominatim")
@Produces(MediaType.APPLICATION_JSON)
interface NominatimApi {

    /**
     * Free-form search: `GET /search?q=&format=jsonv2&limit=1&countrycodes=ru`. No Kotlin default
     * parameters (the REST client ignores them) — the caller passes the constants.
     */
    @GET
    @Path("/search")
    fun search(
        @QueryParam("q") query: String,
        @HeaderParam("User-Agent") userAgent: String,
        @QueryParam("format") format: String,
        @QueryParam("limit") limit: Int,
        @QueryParam("countrycodes") countryCodes: String,
        @QueryParam("accept-language") language: String,
    ): List<NominatimResult>
}

/** One Nominatim match. `lat`/`lon` arrive as STRINGS — parsed in [StationGeocoder]. */
@JsonIgnoreProperties(ignoreUnknown = true)
@RegisterForReflection
data class NominatimResult(
    val lat: String? = null,
    val lon: String? = null,
)
