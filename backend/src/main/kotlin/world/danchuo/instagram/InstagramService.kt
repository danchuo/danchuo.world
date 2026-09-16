package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant

/**
 * Fetches the owner's latest post: profile, newest feed item and the image bytes. Images are taken
 * WHILE THE LINK IS STILL ALIVE — whatever this pass misses cannot be fetched later. The frame is
 * re-downloaded only when `media_id` changed, and the avatar rides along with it. PRD §5.17
 */
@ApplicationScoped
class InstagramService(
    private val config: InstagramConfig,
    private val tokens: InstagramTokenService,
    private val posts: InstagramPostRepository,
    private val storage: InstagramImageStorage,
    @param:RestClient private val graph: InstagramGraphClient,
) {

    private val log: Logger = Logger.getLogger(InstagramService::class.java)

    private val http: HttpClient by lazy {
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    }

    /**
     * One pass. `true` when the post changed. External errors are not let out: the board has no
     * use for them, and the tile keeps the previous post.
     */
    @Transactional
    fun fetchLatest(now: Instant = Instant.now()): Boolean {
        if (!config.isConfigured()) return false
        val token = tokens.accessToken(now) ?: return false

        val profile = runCatching { graph.me(PROFILE_FIELDS, token) }
            .onFailure { log.warn("instagram: профиль прочитать не удалось: ${it.message}") }
            .getOrNull() ?: return false
        val item = runCatching { graph.media(MEDIA_FIELDS, 1, token) }
            .onFailure { log.warn("instagram: ленту прочитать не удалось: ${it.message}") }
            .getOrNull()
            ?.data
            ?.firstOrNull() ?: return false

        val mediaId = item.id ?: return false
        val existing = posts.current()
        val changed = existing == null || existing.mediaId != mediaId

        // Images are fetched only when the post changes — the link lives for hours, and nobody
        // needs a megabyte every half hour for the same frame.
        if (changed) {
            val picture = item.thumbnailUrl ?: item.mediaUrl
            if (picture == null) {
                log.warn("instagram: у поста $mediaId нет картинки — пропускаем")
                return false
            }
            val bytes = download(picture) ?: return false
            storage.put(InstagramImageStorage.Kind.POST, bytes)
            profile.profilePictureUrl?.let { url ->
                download(url)?.let { storage.put(InstagramImageStorage.Kind.AVATAR, it) }
            }
        }

        val post = existing ?: InstagramPost()
        post.mediaId = mediaId
        post.permalink = item.permalink ?: "https://www.instagram.com/${profile.username.orEmpty()}/"
        post.caption = item.caption
        post.mediaType = item.mediaType ?: "IMAGE"
        post.likeCount = item.likeCount
        post.commentsCount = item.commentsCount
        post.postedAt = item.timestamp?.let { parseInstagramTimestamp(it) } ?: post.postedAt
        post.username = profile.username ?: post.username
        post.fetchedAt = now
        posts.persist(post)
        return changed
    }

    private fun download(url: String): ByteArray? {
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(30))
            .GET()
            .build()
        return runCatching {
            val response = http.send(request, HttpResponse.BodyHandlers.ofByteArray())
            // An expired signature arrives exactly like this: a 403 with an empty body.
            if (response.statusCode() !in 200..299) error("HTTP ${response.statusCode()}")
            response.body()
        }.onFailure { log.warn("instagram: картинку скачать не удалось: ${it.message}") }
            .getOrNull()
    }

    private companion object {
        const val PROFILE_FIELDS = "user_id,username,profile_picture_url"
        const val MEDIA_FIELDS =
            "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"
    }
}
