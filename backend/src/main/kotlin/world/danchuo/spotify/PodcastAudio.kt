package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.client.Client
import jakarta.ws.rs.client.ClientBuilder
import jakarta.ws.rs.core.MediaType
import org.jboss.logging.Logger

/** An Apple catalogue entry: the show's name and where its RSS lives. */
@RegisterForReflection
@JsonIgnoreProperties(ignoreUnknown = true)
data class ItunesShow(
    val collectionName: String? = null,
    val feedUrl: String? = null,
)

@RegisterForReflection
@JsonIgnoreProperties(ignoreUnknown = true)
data class ItunesSearch(
    val results: List<ItunesShow> = emptyList(),
)

/** An episode file: address, full size, and whether the host can serve chunks. */
data class RemoteAudio(
    val url: String,
    val totalBytes: Long,
)

/**
 * Fetching an episode's audio: Apple's catalogue for the RSS feed (Spotify gives no feed address
 * at all), then `Range` chunks rather than the file, which is the difference between hundreds of
 * megabytes and seven. Counter redirects are unwrapped by hand, capped by [MAX_HOPS]. §5.16.1
 */
@ApplicationScoped
class PodcastAudioClient(
    private val mapper: ObjectMapper,
    private val config: SpotifyConfig,
) {

    private val log: Logger = Logger.getLogger(PodcastAudioClient::class.java)

    /** A show's feed by name; `null` when the catalogue did not answer or the show is unknown. */
    fun feedUrl(showName: String): String? = client().use { client ->
        val body = runCatching {
            client.target(config.podcast().summary().itunesUrl())
                .path("/search")
                .queryParam("media", "podcast")
                .queryParam("limit", ITUNES_LIMIT)
                .queryParam("term", showName)
                .request()
                .header("User-Agent", USER_AGENT)
                .get(String::class.java)
        }.getOrElse {
            log.debugf("podcast: каталог не ответил про «%s»: %s", showName, it.message)
            return null
        }

        // The Apple catalogue serves `text/javascript` rather than `application/json`, so the
        // string is parsed by hand: a typed REST-client reply trips over that content type.
        val results = runCatching { mapper.readValue(body, ItunesSearch::class.java).results }
            .getOrElse { emptyList() }
        PodcastFeedParser.feedUrlFor(results, showName)
    }

    /** The RSS feed body; `null` when it did not arrive. */
    fun feed(url: String): String? = client().use { client ->
        runCatching {
            client.target(url).request(MediaType.WILDCARD_TYPE)
                .header("User-Agent", USER_AGENT)
                .get(String::class.java)
        }.getOrElse {
            log.debugf("podcast: фид не доехал (%s): %s", url, it.message)
            null
        }
    }

    /**
     * File size and its final address: ask for two bytes and read `Content-Range`. Two bytes
     * rather than a `HEAD` deliberately — it also proves the host really supports `Range`, since
     * a 200 instead of a 206 means it will serve the whole file and there is nothing to cut.
     */
    fun probe(url: String): RemoteAudio? = client().use { client ->
        val (finalUrl, response) = follow(client, url, "bytes=0-1") ?: return null
        response.use {
            if (it.status != PARTIAL_CONTENT) {
                log.debugf("podcast: раздача не отдаёт куски (HTTP %d, %s)", it.status, url)
                return null
            }
            val total = it.getHeaderString("Content-Range")?.substringAfterLast('/')?.toLongOrNull()
            if (total == null || total <= 0) {
                log.debugf("podcast: размер файла неизвестен (%s)", url)
                return null
            }
            RemoteAudio(finalUrl, total)
        }
    }

    /** A file chunk; `null` when the host did not serve it as a chunk. */
    fun slice(url: String, window: ByteWindow): ByteArray? = client().use { client ->
        val (_, response) = follow(client, url, window.header()) ?: return null
        response.use {
            if (it.status != PARTIAL_CONTENT) return null
            it.readEntity(ByteArray::class.java)?.takeIf { bytes -> bytes.isNotEmpty() }
        }
    }

    /**
     * Walks the redirect chain by hand. Returns the address we stopped at and a live response,
     * which the caller must close.
     */
    private fun follow(
        client: Client,
        url: String,
        range: String,
    ): Pair<String, jakarta.ws.rs.core.Response>? {
        var current = url
        repeat(MAX_HOPS) {
            val response = runCatching {
                client.target(current).request(MediaType.WILDCARD_TYPE)
                    .header("User-Agent", USER_AGENT)
                    .header("Range", range)
                    .get()
            }.getOrElse {
                log.debugf("podcast: аудио не доехало (%s): %s", current, it.message)
                return null
            }

            if (response.status !in REDIRECTS) return current to response
            val next = response.getHeaderString("Location")
            response.close()
            if (next.isNullOrBlank()) return null
            current = if (next.startsWith("http")) next else resolve(current, next)
        }
        log.debugf("podcast: слишком длинная цепочка редиректов (%s)", url)
        return null
    }

    /** A relative `Location` is rare but happens; resolve it against the current address. */
    private fun resolve(base: String, location: String): String =
        runCatching { java.net.URI(base).resolve(location).toString() }.getOrDefault(location)

    private fun client(): Client = ClientBuilder.newBuilder()
        .connectTimeout(config.podcast().summary().connectTimeoutSeconds(), java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(config.podcast().summary().readTimeoutSeconds(), java.util.concurrent.TimeUnit.SECONDS)
        .build()

    private companion object {
        const val PARTIAL_CONTENT = 206
        const val MAX_HOPS = 6
        const val ITUNES_LIMIT = 5
        val REDIRECTS = setOf(301, 302, 303, 307, 308)

        /**
         * Podcast hosts answer a client that named itself far more willingly. The name is honest:
         * this is our board, not a browser.
         */
        const val USER_AGENT = "danchuo.world/1.0 (+https://danchuo.world)"
    }
}
