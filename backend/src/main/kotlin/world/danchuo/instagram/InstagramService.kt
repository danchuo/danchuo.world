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
 * Забор последнего поста владельца (PRD §5.17): профиль, свежий пост ленты и байты картинок.
 *
 * ⚠️ **Картинки снимаются, пока ссылка жива.** И `media_url`, и `profile_picture_url` —
 * подписанные URL со сроком в несколько часов; всё, что не скачано в этом же проходе, потом
 * уже не скачать ([InstagramImageStorage]).
 *
 * ⚠️ **Кадр перекачивается, только когда сменился пост** (сверка по `media_id`). Ссылка у
 * того же поста меняется от запроса к запросу, так что сравнивать по ней нельзя, а качать
 * мегабайт каждые полчаса — незачем. Аватар обновляется вместе с постом: отдельного признака
 * «сменилась аватарка» у API нет, а раз в пост — достаточно часто.
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
     * Один проход. `true` — пост обновился. Ошибки внешнего источника наружу не выпускаем:
     * борду они не нужны, на плитке останется прежний пост.
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

        // Картинки тянем только на смене поста — ссылка живёт часами, но мегабайт каждые
        // полчаса ради того же кадра не нужен никому.
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
            // Просроченная подпись приходит именно так: 403 с пустым телом.
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
