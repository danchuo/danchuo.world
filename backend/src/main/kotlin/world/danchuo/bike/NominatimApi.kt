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
 * REST-клиент геокодера OSM **Nominatim** — превращаем надёжный адрес станции Велобайка в
 * координаты (см. [StationGeocoder]). URL задаётся в `application.properties`
 * (`quarkus.rest-client.nominatim.url`, дефолт `https://nominatim.openstreetmap.org`).
 *
 * Nominatim требует внятный `User-Agent` (идентификацию приложения) — передаём его заголовком из
 * конфига. Ответ — массив совпадений; берём первое. Использование лёгкое (уникальный адрес геокодим
 * один раз и кэшируем в [BikeStation]), поэтому укладываемся в usage policy публичного сервера.
 */
@RegisterRestClient(configKey = "nominatim")
@Produces(MediaType.APPLICATION_JSON)
interface NominatimApi {

    /**
     * Поиск по свободному запросу: `GET /search?q=&format=jsonv2&limit=1&countrycodes=ru`.
     * Без Kotlin-дефолтов параметров (REST-клиент их не поддерживает) — константы передаёт вызывающий.
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

/** Одно совпадение Nominatim. `lat`/`lon` приходят **строками** — парсим в [StationGeocoder]. */
@JsonIgnoreProperties(ignoreUnknown = true)
@RegisterForReflection
data class NominatimResult(
    val lat: String? = null,
    val lon: String? = null,
)
