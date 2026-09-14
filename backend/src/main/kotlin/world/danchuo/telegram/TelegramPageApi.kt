package world.danchuo.telegram

import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Публичная страница-визитка `t.me/{ник}` — та самая, что открывается по ссылке на профиль.
 * Отдаёт **HTML**, а не JSON: API под карточку пользователя у Telegram нет вовсе (разбор
 * канала — во врезе [TelegramProfileParser]).
 *
 * База — `quarkus.rest-client.telegram-page.url` (`https://t.me`).
 * Без Kotlin-дефолтов у параметров: REST-клиент их не поддерживает.
 */
@RegisterRestClient(configKey = "telegram-page")
@Produces(MediaType.TEXT_HTML)
interface TelegramPageApi {

    /** `GET /{ник}` — визитка с og-разметкой, без авторизации. */
    @GET
    @Path("/{username}")
    fun profilePage(
        @PathParam("username") username: String,
        @HeaderParam("User-Agent") userAgent: String,
    ): String
}
