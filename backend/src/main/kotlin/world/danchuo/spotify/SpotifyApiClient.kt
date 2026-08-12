package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.GET
import jakarta.ws.rs.HeaderParam
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Клиент `api.spotify.com` — read-only слой плеера (PRD §M3). Базовый URL —
 * `quarkus.rest-client.spotify-api.url`. Access-токен передаётся в `Authorization:
 * Bearer …` на каждый вызов (его готовит [SpotifyTokenService] из refresh-токена).
 *
 * DTO — минимальная проекция Spotify-ответов: берём только поля, что рендерим,
 * `@JsonIgnoreProperties(ignoreUnknown = true)` глушит остальное (API богат).
 */
@RegisterRestClient(configKey = "spotify-api")
interface SpotifyApiClient {

    /**
     * Текущее воспроизведение; при «ничего не играет» Spotify отдаёт 204 ⇒ тело `null`.
     *
     * [additionalTypes] — типы сверх дефолтного `track`, которые клиент готов принять
     * (`track,episode`). Без него подкаст не приезжает вовсе: эпизоды скрыты ради обратной
     * совместимости со старыми интеграциями. Скоупов параметр не требует — хватает того же
     * `user-read-currently-playing`.
     *
     * [market] обязателен по смыслу: без него (и без страны в токене) Spotify считает контент
     * недоступным и молча отдаёт пустой ответ.
     *
     * Дефолты параметров тут не котлиновские, а на каждой точке вызова: REST-клиент
     * MicroProfile значения по умолчанию не поддерживает.
     */
    @GET
    @Path("/v1/me/player/currently-playing")
    @Produces(MediaType.APPLICATION_JSON)
    fun currentlyPlaying(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("additional_types") additionalTypes: String,
        @QueryParam("market") market: String,
    ): SpotifyCurrentlyPlaying?

    @GET
    @Path("/v1/me/player/recently-played")
    @Produces(MediaType.APPLICATION_JSON)
    fun recentlyPlayed(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("limit") limit: Int,
    ): SpotifyRecentlyPlayed

    @GET
    @Path("/v1/me/top/tracks")
    @Produces(MediaType.APPLICATION_JSON)
    fun topTracks(
        @HeaderParam("Authorization") bearer: String,
        @QueryParam("limit") limit: Int,
        @QueryParam("time_range") timeRange: String,
    ): SpotifyPaging

    /** Имя плейлиста по id (для строки-источника). `fields=name` — отдаёт только имя. */
    @GET
    @Path("/v1/playlists/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    fun playlist(
        @HeaderParam("Authorization") bearer: String,
        @PathParam("id") id: String,
        @QueryParam("fields") fields: String,
    ): SpotifyNamed

    /** Имя артиста по id (для строки-источника, когда играешь со страницы артиста). */
    @GET
    @Path("/v1/artists/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    fun artist(
        @HeaderParam("Authorization") bearer: String,
        @PathParam("id") id: String,
    ): SpotifyNamed
}

/** Минимальная проекция «объект с именем» — плейлист/артист (берём только name). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyNamed(
    @param:JsonProperty("name") val name: String? = null,
)

// ── Сырые DTO Spotify Web API (только нужные поля) ──

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyCurrentlyPlaying(
    @param:JsonProperty("is_playing") val isPlaying: Boolean = false,
    @param:JsonProperty("progress_ms") val progressMs: Long? = null,
    @param:JsonProperty("item") val item: SpotifyTrack? = null,
    // Откуда играет: плейлист/альбом/артист/подкаст/«любимое». Бывает null (вне контекста).
    @param:JsonProperty("context") val context: SpotifyContext? = null,
    // «track» либо «episode» — дискриминатор союза в [item]. Дублирует item.type, но приезжает
    // даже тогда, когда сам item пуст, поэтому решение по нему надёжнее.
    @param:JsonProperty("currently_playing_type") val currentlyPlayingType: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyContext(
    @param:JsonProperty("type") val type: String? = null,
    @param:JsonProperty("uri") val uri: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyRecentlyPlayed(
    @param:JsonProperty("items") val items: List<SpotifyPlayHistory>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPlayHistory(
    @param:JsonProperty("track") val track: SpotifyTrack? = null,
    @param:JsonProperty("played_at") val playedAt: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyPaging(
    @param:JsonProperty("items") val items: List<SpotifyTrack>? = null,
)

/**
 * Проекция поля `item` — оно СОЮЗ трека и эпизода подкаста, различаемый по [type]
 * (и по `currently_playing_type` снаружи). Общее у них — имя, длительность и ссылка; дальше
 * расходятся: у трека артисты и альбом, у эпизода [show] и собственные [images].
 *
 * Одним типом, а не двумя, — потому что Jackson разбирает одно и то же поле, и разводить союз
 * пришлось бы кастомным десериализатором ради двух полей. Пустая половина остаётся пустой.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyTrack(
    @param:JsonProperty("id") val id: String? = null,
    @param:JsonProperty("type") val type: String? = null,
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("artists") val artists: List<SpotifyArtist>? = null,
    @param:JsonProperty("album") val album: SpotifyAlbum? = null,
    @param:JsonProperty("duration_ms") val durationMs: Long? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
    // Обложка эпизода: у трека картинка лежит в альбоме, у эпизода — прямо на нём.
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
    @param:JsonProperty("show") val show: SpotifyShow? = null,
)

/**
 * Шоу подкаста внутри эпизода. Издателя (`publisher`) во вложенном объекте нет — «автором»
 * карточки служит [name]; за настоящим издателем пришлось бы ходить в `/v1/shows/{id}`
 * (рассмотрено и отклонено: владельцу достаточно названия шоу).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyShow(
    @param:JsonProperty("id") val id: String? = null,
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyArtist(
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyAlbum(
    @param:JsonProperty("name") val name: String? = null,
    @param:JsonProperty("album_type") val albumType: String? = null,
    @param:JsonProperty("images") val images: List<SpotifyImage>? = null,
    @param:JsonProperty("external_urls") val externalUrls: SpotifyExternalUrls? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyImage(
    @param:JsonProperty("url") val url: String? = null,
    @param:JsonProperty("width") val width: Int? = null,
    @param:JsonProperty("height") val height: Int? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SpotifyExternalUrls(
    @param:JsonProperty("spotify") val spotify: String? = null,
)
