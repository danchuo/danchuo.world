package world.danchuo.instagram

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger

/**
 * Фоновый забор последнего поста (PRD §5.17). Внешний источник целиком в слайсе: наружу уходит
 * только [InstagramPost] и снятые байты картинок.
 *
 * **Почему опрос, а не вебхук.** Вебхуки Instagram шлют события сообщений и комментариев, а не
 * «владелец опубликовал пост»; узнать о новом посте можно только спросив. Полчаса — с большим
 * запасом: постов бывает меньше одного в сутки, а лимит источника — 200 вызовов в час.
 *
 * **Сбой канала ничего не портит.** Нет сети, отозваны права, сменился формат — проход просто
 * не пишет, на борде остаётся прежний пост, следующий такт попробует снова.
 */
@ApplicationScoped
class InstagramPoller(
    private val config: InstagramConfig,
    private val tokens: InstagramTokenService,
    private val service: InstagramService,
) {

    private val log: Logger = Logger.getLogger(InstagramPoller::class.java)

    @Scheduled(
        every = "{danchuo.instagram.poll-interval}",
        delayed = "45s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.enabled() || !config.isConfigured()) return
        // Продление идёт первым и своей транзакцией: неудачный забор поста не должен
        // откатывать удачно продлённый токен — второго шанса продлить может не быть.
        runCatching { tokens.refreshIfDue() }
            .onFailure { log.warn("instagram: продление токена сорвалось: ${it.message}") }
        runCatching { service.fetchLatest() }
            .onFailure { log.warn("instagram: забор поста сорвался: ${it.message}") }
    }
}
