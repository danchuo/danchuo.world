package world.danchuo.instagram

import com.fasterxml.jackson.annotation.JsonFormat
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.MultivaluedMap
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient

/**
 * Обмен кода на токен (PRD §5.17). Живёт на `api.instagram.com` — ОТДЕЛЬНОМ хосте от самого
 * API: это не наша прихоть, а разделение у Instagram (как `accounts.spotify.com` против
 * `api.spotify.com`). Базовый URL — `quarkus.rest-client.instagram-auth.url`.
 */
@RegisterRestClient(configKey = "instagram-auth")
interface InstagramAuthClient {

    @POST
    @Path("/oauth/access_token")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Produces(MediaType.APPLICATION_JSON)
    fun exchangeCode(form: MultivaluedMap<String, String>): InstagramShortTokenResponse
}

/**
 * Чтение ленты и продление токена — `graph.instagram.com`
 * (`quarkus.rest-client.instagram-graph.url`).
 *
 * ⚠️ Токен здесь идёт ПАРАМЕТРОМ запроса, а не заголовком `Authorization`: так устроен
 * Instagram. Значит, он попадает в URL — не логировать запросы этого клиента целиком.
 */
@RegisterRestClient(configKey = "instagram-graph")
interface InstagramGraphClient {

    /** Короткий токен → долгоживущий (60 дней). */
    @GET
    @Path("/access_token")
    @Produces(MediaType.APPLICATION_JSON)
    fun exchangeLongLived(
        @QueryParam("grant_type") grantType: String,
        @QueryParam("client_secret") clientSecret: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramLongTokenResponse

    /** Продление живого долгоживущего токена — ещё 60 дней ([InstagramTokenPolicy]). */
    @GET
    @Path("/refresh_access_token")
    @Produces(MediaType.APPLICATION_JSON)
    fun refresh(
        @QueryParam("grant_type") grantType: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramLongTokenResponse

    /** Профиль владельца: ник для шапки карточки. */
    @GET
    @Path("/me")
    @Produces(MediaType.APPLICATION_JSON)
    fun me(
        @QueryParam("fields") fields: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramProfileResponse

    /** Лента владельца, свежие сверху. */
    @GET
    @Path("/me/media")
    @Produces(MediaType.APPLICATION_JSON)
    fun media(
        @QueryParam("fields") fields: String,
        @QueryParam("limit") limit: Int,
        @QueryParam("access_token") accessToken: String,
    ): InstagramMediaPage
}

/**
 * Короткоживущий токен первого шага обмена.
 *
 * ⚠️ [permissions] приезжает МАССИВОМ, хотя в документации Instagram описан строкой.
 * Тип обязан принимать обе формы, иначе рассинхрон валит ВЕСЬ обмен кода — а код одноразовый,
 * и чинится это только новым заходом владельца в браузер.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class InstagramShortTokenResponse(
    @param:JsonProperty("access_token") val accessToken: String? = null,
    @param:JsonProperty("user_id") val userId: String? = null,
    @param:JsonProperty("permissions")
    @param:JsonFormat(with = [JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY])
    val permissions: List<String>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class InstagramLongTokenResponse(
    @param:JsonProperty("access_token") val accessToken: String? = null,
    @param:JsonProperty("token_type") val tokenType: String? = null,
    @param:JsonProperty("expires_in") val expiresIn: Long? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class InstagramProfileResponse(
    @param:JsonProperty("user_id") val userId: String? = null,
    @param:JsonProperty("username") val username: String? = null,
    @param:JsonProperty("profile_picture_url") val profilePictureUrl: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class InstagramMediaPage(
    @param:JsonProperty("data") val data: List<InstagramMediaItem> = emptyList(),
)

/**
 * Один пост ленты.
 *
 * ⚠️ [likeCount] и [commentsCount] — `Int?` намеренно: Instagram не присылает их, когда
 * владелец спрятал счётчики у поста. Отсутствие — законное состояние, а не сбой, и карточка
 * просто не рисует строку.
 *
 * ⚠️ [mediaUrl] у видео — сам файл, а не кадр; превью лежит в [thumbnailUrl]. Карточке нужна
 * картинка, поэтому забирать надо `thumbnailUrl ?: mediaUrl`.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class InstagramMediaItem(
    @param:JsonProperty("id") val id: String? = null,
    @param:JsonProperty("caption") val caption: String? = null,
    @param:JsonProperty("media_type") val mediaType: String? = null,
    @param:JsonProperty("media_url") val mediaUrl: String? = null,
    @param:JsonProperty("thumbnail_url") val thumbnailUrl: String? = null,
    @param:JsonProperty("permalink") val permalink: String? = null,
    @param:JsonProperty("timestamp") val timestamp: String? = null,
    @param:JsonProperty("like_count") val likeCount: Int? = null,
    @param:JsonProperty("comments_count") val commentsCount: Int? = null,
)
