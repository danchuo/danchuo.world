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
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder

/**
 * Code-for-token exchange (PRD §5.17). It lives on `api.instagram.com`, a SEPARATE host from the
 * API itself — not our whim but Instagram's split, like `accounts.spotify.com` against
 * `api.spotify.com`. Base URL is `quarkus.rest-client.instagram-auth.url`.
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
 * Feed reads and token renewal against `graph.instagram.com`. The token travels as a QUERY
 * PARAMETER rather than an `Authorization` header — that is how Instagram is built — so it ends
 * up inside the URL: never log this client's requests whole.
 */
@RegisterRestClient(configKey = "instagram-graph")
interface InstagramGraphClient {

    /** Short token to a long-lived one (60 days). */
    @GET
    @Path("/access_token")
    @Produces(MediaType.APPLICATION_JSON)
    fun exchangeLongLived(
        @QueryParam("grant_type") grantType: String,
        @QueryParam("client_secret") clientSecret: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramLongTokenResponse

    /** Extends a live long-lived token by another 60 days ([InstagramTokenPolicy]). */
    @GET
    @Path("/refresh_access_token")
    @Produces(MediaType.APPLICATION_JSON)
    fun refresh(
        @QueryParam("grant_type") grantType: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramLongTokenResponse

    /** The owner's profile: the handle for the card header. */
    @GET
    @Path("/me")
    @Produces(MediaType.APPLICATION_JSON)
    fun me(
        @QueryParam("fields") fields: String,
        @QueryParam("access_token") accessToken: String,
    ): InstagramProfileResponse

    /** The owner's feed, newest first. */
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
 * Short-lived token from the first exchange step. [permissions] arrives as an ARRAY although the
 * docs describe a string, so the type must accept both forms — a mismatch fails the WHOLE code
 * exchange, and the code is one-shot. PRD §5.17
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
 * One feed post. [likeCount] and [commentsCount] are `Int?` deliberately: Instagram omits them
 * when the owner hides counters, a legal state rather than a failure. On a video [mediaUrl] is the
 * file itself and the still sits in [thumbnailUrl], so a card wants `thumbnailUrl ?: mediaUrl`.
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

/**
 * An offset with NO colon (`+0000`) is exactly how Instagram writes a media `timestamp`. The
 * standard parsers refuse that form: `ISO_OFFSET_DATE_TIME` wants `+00:00` and `Instant.parse`
 * wants `Z`.
 */
private val BASIC_OFFSET: DateTimeFormatter = DateTimeFormatterBuilder()
    .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
    .appendOffset("+HHMM", "Z")
    .toFormatter()

/**
 * Publication time of a post. A MISS HERE IS INVISIBLE in the log and in the API response: an
 * unread time leaves [Instant.EPOCH], valid ISO 1970 goes out, and the board says "20710 days ago"
 * — a parsing miss that looks like broken layout. Hence all three offset forms. PRD §5.17
 */
internal fun parseInstagramTimestamp(raw: String): Instant? =
    runCatching { OffsetDateTime.parse(raw, BASIC_OFFSET).toInstant() }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull()
        ?: runCatching { Instant.parse(raw) }.getOrNull()
