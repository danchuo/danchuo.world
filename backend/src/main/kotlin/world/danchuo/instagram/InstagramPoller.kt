package world.danchuo.instagram

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger

/**
 * Background fetch of the latest post; only [InstagramPost] and the downloaded bytes leave the
 * slice. Polling rather than webhooks, because Instagram's webhooks carry messages and comments,
 * never publications. A failed pass writes nothing and the board keeps the old post. PRD §5.17
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
        // Renewal goes first and in its own transaction: a failed post fetch must not roll back a
        // successfully renewed token — there may be no second chance to renew.
        runCatching { tokens.refreshIfDue() }
            .onFailure { log.warn("instagram: продление токена сорвалось: ${it.message}") }
        runCatching { service.fetchLatest() }
            .onFailure { log.warn("instagram: забор поста сорвался: ${it.message}") }
    }
}
