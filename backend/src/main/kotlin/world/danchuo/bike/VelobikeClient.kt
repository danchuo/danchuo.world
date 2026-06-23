package world.danchuo.bike

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/** Тело логина `client-authenticate`: телефон + 4-значный код из SMS. */
data class VelobikeAuthRequest(val user: String, val password: String)

/**
 * REST-клиент к API Велобайка (`pwa.velobike.ru`) — эндпоинты, подтверждённые реверсом
 * мобильного приложения. URL и (опц.) прокси задаются в `application.properties`
 * (`quarkus.rest-client.velobike.*`). Refresh→access вынесен из этого интерфейса в
 * [VelobikeTokenService] (его путь реверсом не подтверждён ⇒ держим в конфиге).
 *
 * ⚠️ Перед API стоит Qrator: эти вызовы с сервера (датацентр-IP) будут отбиты, пока трафик
 * не пойдёт через резидентный прокси (PRD §13). Контракт верен — это проблема доставки, не схемы.
 */
@RegisterRestClient(configKey = "velobike")
@Produces(MediaType.APPLICATION_JSON)
interface VelobikeClient {

    /** Запросить SMS-код на телефон: `POST /api/api-auth/code/{phone}`. */
    @POST
    @Path("/api/api-auth/code/{phone}")
    fun requestCode(
        @PathParam("phone") phone: String,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
    ): VelobikeCodeResponse

    /** Логин по телефону + коду: `POST /api/api-auth/client-authenticate` → токены. */
    @POST
    @Path("/api/api-auth/client-authenticate")
    fun authenticate(
        body: VelobikeAuthRequest,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
    ): VelobikeAuthResponse

    /** Страница истории поездок: `GET /api/rent/rents/client?size=&page=&statuses=TECH_DONE,DONE`. */
    @GET
    @Path("/api/rent/rents/client")
    fun listRents(
        @HeaderParam("Authorization") bearer: String,
        @HeaderParam("App-version") appVersion: String,
        @HeaderParam("source") source: String,
        @HeaderParam("lang") lang: String,
        @QueryParam("size") size: Int,
        @QueryParam("page") page: Int,
        @QueryParam("statuses") statuses: String,
    ): RentPage
}
