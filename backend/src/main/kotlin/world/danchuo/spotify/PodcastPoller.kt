package world.danchuo.spotify

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayRecordService
import java.time.Instant

/**
 * Фоновая запись прослушанных подкастов (PRD §5.6, реестр B2). Внешний источник целиком в слайсе:
 * наружу уходят только сессии ([PodcastSession]) и производная отметка пункта.
 *
 * **Зачем свой поллер, когда now-playing уже опрашивается.** Тот опрос управляется зрителем:
 * просыпается на запрос борда и кэшируется на 20 секунд. Не открыл сайт — никто ничего не спросил,
 * и час прослушивания пропал. Логгеру нужен собственный такт, независимый от посетителей.
 *
 * **Почему опросом, а не готовой историей.** Её нет: `recently-played` подкасты не возвращает
 * («Currently doesn't support podcast episodes» — прямо в доках), а `resume_point` знает только
 * положение головки и флаг «дослушано», без времени и без «когда». Рассмотрено и отклонено:
 * ночная сверка по `resume_point` — она требует отдельного скоупа и обхода всех подписок, а
 * ответить «сколько минут сегодня» всё равно не может.
 *
 * **Сбой канала ничего не портит.** Сеть, протухший токен, неподключённый слайс — прогон просто
 * не пишет; следующая минута попробует снова. Пропущенный отсчёт стоит недобора в один интервал,
 * а не поломки: минуты считаются по дельте головки, а не по числу опросов ([PodcastListenMath]).
 */
@ApplicationScoped
class PodcastPoller(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
    private val config: SpotifyConfig,
    private val listens: PodcastListenService,
    private val days: DayRecordService,
    private val mskTime: MskTime,
) {

    private val log: Logger = Logger.getLogger(PodcastPoller::class.java)

    @Scheduled(
        every = "{danchuo.spotify.podcast.poll-interval}",
        delayed = "45s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.podcast().enabled() || !config.isConfigured()) return
        runCatching { pollOnce() }
            .onFailure {
                // Не прошли OAuth — это нормальное состояние, а не поломка: молчим.
                if (it !is SpotifyNotConnectedException) {
                    log.warn("spotify: опрос подкаста не удался (сеть/токен?): ${it.message}")
                }
            }
    }

    /** Один отсчёт. Возвращает зачтённые миллисекунды: 0 — пауза, музыка или ничего не играет. */
    fun pollOnce(): Long {
        val sample = sample() ?: return 0
        val credited = listens.record(sample, mskTime.today(), Instant.now())
        // Проекция дня зависит от минут и карточек; сбрасываем её, только когда они сдвинулись.
        if (credited > 0) days.invalidateProjection()
        return credited
    }

    /** Снять отсчёт с плеера; `null` — играет не подкаст либо ответ без нужных полей. */
    private fun sample(): EpisodeSample? {
        // 204 (ничего не играет) ⇒ тело null. Пауза сюда доходит и даёт нулевую дельту сама.
        val current = api.currentlyPlaying(
            tokenService.bearer(),
            ADDITIONAL_TYPES,
            config.podcast().market(),
        ) ?: return null

        if (current.currentlyPlayingType != EPISODE_TYPE) return null
        val item = current.item ?: return null
        val show = item.show

        return EpisodeSample(
            episodeId = item.id ?: return null,
            progressMs = current.progressMs ?: return null,
            episodeName = item.name ?: return null,
            episodeUrl = item.externalUrls?.spotify,
            showId = show?.id,
            // Название шоу — «автор» карточки; издателя плеер не отдаёт (решение владельца:
            // названия достаточно). Без шоу эпизод не карточка — пропускаем отсчёт целиком.
            showName = show?.name ?: return null,
            showUrl = show?.externalUrls?.spotify,
            imageUrl = item.images.smallestAtLeast(THUMB_MIN_PX) ?: show?.images.smallestAtLeast(THUMB_MIN_PX),
            episodeDurationMs = item.durationMs,
        )
    }

    /**
     * Самая маленькая обложка не мельче [minPx] — карточке нужен значок, а не полотно 640×640.
     * Spotify отдаёт набор 640/300/64; берём 300, а 64 остаётся запасом, если крупных нет.
     */
    private fun List<SpotifyImage>?.smallestAtLeast(minPx: Int): String? =
        orEmpty().filter { (it.width ?: 0) >= minPx }.minByOrNull { it.width ?: Int.MAX_VALUE }?.url
            ?: orEmpty().maxByOrNull { it.width ?: 0 }?.url

    private companion object {
        /** Без `episode` в списке подкаст не приезжает вовсе (обратная совместимость Spotify). */
        const val ADDITIONAL_TYPES = "track,episode"
        const val EPISODE_TYPE = "episode"

        /** Нижняя граница обложки карточки, px. */
        const val THUMB_MIN_PX = 300
    }
}
