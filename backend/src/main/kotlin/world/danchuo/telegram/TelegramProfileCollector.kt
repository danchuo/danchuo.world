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

/** Снятый аватар: байты, их тип и отметка забора — из неё собирается версия адреса. */
class TelegramAvatar(val bytes: ByteArray, val contentType: String, val version: Long)

/**
 * Фоновый забор визитки Telegram (PRD §5.18): страница `t.me/{ник}` → имя, статус, аватар.
 *
 * **Хранится в памяти, а не в базе.** Визитка — не история и не данные дня: она всегда
 * «сейчас», её нечего накапливать и не с чем сверять. Переживать рестарт ей тоже незачем —
 * первый же такт (через полминуты после старта) наполняет её заново, а до тех пор карточки
 * просто нет, как и у не забранного поста Instagram.
 *
 * **Аватар снимается к себе.** Не из-за срока жизни ссылки (у Telegram она долгая), а чтобы
 * борд не отправлял каждого зрителя на CDN мессенджера: там, где Telegram замедляют, аватарка
 * приезжала бы дырой. Перекачиваем только на смене адреса — картинка меняется раз в годы.
 *
 * **Сбой канала ничего не стирает.** Нет сети, страница ошибки, поехавшая разметка — разбор
 * отдаёт `null`, и проход просто не пишет: на борде остаётся прежняя визитка (та же доктрина,
 * что «пустой прогон Health не стирает ночь»).
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

    /** Адрес аватара, под который сняты [avatar]: по нему видно, надо ли перекачивать. */
    @Volatile
    private var avatarSource: String? = null

    /** Что показывать борду. `null` — визитки ещё нет (первый такт не прошёл или канал молчит). */
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

    /** Один проход: страница → разбор → снятый аватар. `true` — визитка обновилась. */
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
                // Тип берём из ответа, а не гадаем по байтам: CDN его присылает честно.
                contentType = response.headers().firstValue("content-type").orElse("image/jpeg"),
                version = System.currentTimeMillis(),
            )
        }.onFailure { log.warn("telegram: аватар скачать не удалось: ${it.message}") }
            .getOrNull()
    }
}
