package world.danchuo.telegram

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** A downloaded avatar: bytes, their type, and the fetch stamp the URL version is built from. */
class TelegramAvatar(val bytes: ByteArray, val contentType: String, val version: Long)

/**
 * Background fetch of the Telegram card. It is kept IN MEMORY, not the DB: a card is always "now",
 * there is nothing to accumulate, and the first tick refills it after a restart. The avatar is
 * copied locally so the board never sends a viewer to Telegram's CDN. A failed pass writes nothing.
 */
@ApplicationScoped
class TelegramProfileCollector(
    @param:RestClient private val api: TelegramPageApi,
    private val config: TelegramConfig,
) {

    private val log: Logger = Logger.getLogger(TelegramProfileCollector::class.java)

    private val http: HttpClient by lazy {
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    }

    @Volatile
    private var profile: TelegramProfile? = null

    @Volatile
    private var avatar: TelegramAvatar? = null

    /** The address [avatar] was downloaded from, which is how we know whether to fetch again. */
    @Volatile
    private var avatarSource: String? = null

    /** What to show the board; `null` means no card yet — first tick pending or channel silent. */
    fun current(): TelegramProfile? = profile

    fun currentAvatar(): TelegramAvatar? = avatar

    @Scheduled(
        every = "{danchuo.telegram.poll-interval}",
        delayed = "25s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun collect() {
        if (!config.enabled()) return
        runCatching { collectOnce() }
            .onFailure { log.warn("telegram: визитку забрать не удалось (сеть/разметка?): ${it.message}") }
    }

    /** One pass: page, parse, downloaded avatar. `true` if the card changed. */
    fun collectOnce(): Boolean {
        val username = config.username()
        val html = api.profilePage(username, config.userAgent())
        val parsed = TelegramProfileParser.parse(html, username)
        if (parsed == null) {
            log.warn("telegram: страница @$username не разобрана (${html.length} символов) — оставляю прежнюю визитку")
            return false
        }

        val source = parsed.avatarUrl
        if (source != null && source != avatarSource) {
            download(source)?.let {
                avatar = it
                avatarSource = source
            }
        }
        profile = parsed
        return true
    }

    private fun download(url: String): TelegramAvatar? {
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(30))
            .GET()
            .build()
        return runCatching {
            val response = http.send(request, HttpResponse.BodyHandlers.ofByteArray())
            if (response.statusCode() !in 200..299) error("HTTP ${response.statusCode()}")
            TelegramAvatar(
                bytes = response.body(),
                // Take the type from the response rather than guessing from bytes: the CDN is honest.
                contentType = response.headers().firstValue("content-type").orElse("image/jpeg"),
                version = System.currentTimeMillis(),
            )
        }.onFailure { log.warn("telegram: аватар скачать не удалось: ${it.message}") }
            .getOrNull()
    }
}
