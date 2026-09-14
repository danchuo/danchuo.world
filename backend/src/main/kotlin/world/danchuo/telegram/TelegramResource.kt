package world.danchuo.telegram

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.CacheControl
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

/**
 * Публичное чтение визитки Telegram (PRD §5.18): `GET /api/telegram/profile` и снятый аватар
 * под `GET /api/telegram/avatar`.
 *
 * Визитки ещё нет (первый такт не прошёл, канал молчит) — **204**, а не 404 и не пустой
 * объект: плитка должна отличать «показывать нечего» от поломки и молча не рисовать карточку
 * (DESIGN §7).
 */
@Path("/api/telegram")
class TelegramResource(private val collector: TelegramProfileCollector) {

    @GET
    @Path("/profile")
    @Produces(MediaType.APPLICATION_JSON)
    fun profile(): Response {
        val profile = collector.current() ?: return Response.noContent().build()
        return Response.ok(
            TelegramProfileView(
                name = profile.name,
                username = profile.username,
                bio = profile.bio,
                // Версия в адресе — от отметки забора: имя файла от картинки не зависит, и
                // сменивший аватарку владелец получал бы у зрителя прежнюю из кэша браузера.
                avatarUrl = collector.currentAvatar()?.let { "/api/telegram/avatar?v=${it.version}" },
            ),
        ).build()
    }

    @GET
    @Path("/avatar")
    fun avatar(): Response {
        val avatar = collector.currentAvatar() ?: return Response.status(Response.Status.NOT_FOUND).build()
        // Час: адрес несёт версию, поэтому новая аватарка приезжает своим URL, а не ждёт кэша.
        val cache = CacheControl().apply { maxAge = 3600 }
        return Response.ok(avatar.bytes, avatar.contentType).cacheControl(cache).build()
    }
}
