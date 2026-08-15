package world.danchuo.spotify

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
import io.quarkus.runtime.annotations.RegisterForReflection
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.client.Client
import jakarta.ws.rs.client.ClientBuilder
import jakarta.ws.rs.core.MediaType
import org.jboss.logging.Logger

/** Запись каталога Apple: как называется шоу и где лежит его RSS. */
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

/** Файл выпуска: адрес, полный размер и признак того, что раздача умеет отдавать куски. */
data class RemoteAudio(
    val url: String,
    val totalBytes: Long,
)

/**
 * Поход за аудио выпуска (PRD §5.16.1): каталог → RSS → куски файла.
 *
 * **Зачем через каталог Apple.** Spotify не отдаёт адрес RSS-фида вовсе, а собственного API
 * поиска подкастов у нас нет. Бесплатный `itunes.apple.com/search` не требует ни ключа, ни
 * регистрации и на фонотеке владельца нашёл фид в 6 случаях из 6.
 *
 * **Почему куски, а не файл.** Выпуск весит десятки и сотни мегабайт (замер: 307 МБ у
 * Huberman), а слушают из него минуты. Раздачи подкастов поддерживают `Range` (6 из 6), и
 * скачивание окон вместо файла — разница между сотнями мегабайт и семью.
 *
 * **Редиректы разворачиваем сами.** Ссылки в фидах идут через счётчики (podtrac, mgln.ai,
 * pdst.fm) и дают цепочку 302; клиент RESTEasy Reactive по умолчанию их не проходит, а
 * молчаливое «пустое тело» отладить потом трудно. Цепочка ограничена [MAX_HOPS] — чужая
 * раздача не должна уметь закольцевать наш фон.
 */
@ApplicationScoped
class PodcastAudioClient(
    private val mapper: ObjectMapper,
    private val config: SpotifyConfig,
) {

    private val log: Logger = Logger.getLogger(PodcastAudioClient::class.java)

    /** Фид шоу по названию; `null` — каталог не ответил либо шоу не опознано. */
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

        // Каталог Apple отдаёт `text/javascript`, а не `application/json`, поэтому разбираем
        // строку сами: типизированный ответ REST-клиента на этом content-type спотыкается.
        val results = runCatching { mapper.readValue(body, ItunesSearch::class.java).results }
            .getOrElse { emptyList() }
        PodcastFeedParser.feedUrlFor(results, showName)
    }

    /** Тело RSS-фида; `null` — не доехал. */
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
     * Размер файла и его окончательный адрес: спрашиваем два байта и читаем `Content-Range`.
     *
     * Двумя байтами, а не `HEAD`, намеренно: заодно проверяется, что раздача правда умеет
     * `Range` — ответ 200 вместо 206 означает, что она отдаст файл целиком, и резать его нечем.
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

    /** Кусок файла; `null` — раздача не отдала его куском. */
    fun slice(url: String, window: ByteWindow): ByteArray? = client().use { client ->
        val (_, response) = follow(client, url, window.header()) ?: return null
        response.use {
            if (it.status != PARTIAL_CONTENT) return null
            it.readEntity(ByteArray::class.java)?.takeIf { bytes -> bytes.isNotEmpty() }
        }
    }

    /**
     * Пройти цепочку редиректов вручную. Возвращает адрес, на котором остановились, и живой
     * ответ — закрыть его обязан вызывающий.
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

    /** Относительный `Location` — редкость, но встречается; разворачиваем от текущего адреса. */
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
         * Раздачи подкастов заметно охотнее отвечают клиенту, который назвался. Имя честное:
         * это наш борд, а не браузер.
         */
        const val USER_AGENT = "danchuo.world/1.0 (+https://danchuo.world)"
    }
}
