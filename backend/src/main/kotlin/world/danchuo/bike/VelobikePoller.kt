package world.danchuo.bike

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * Background poll of Velobike ride history: pages `rents/client` and stops as soon as a page
 * brings no new ride, capped by [MAX_PAGES]. Off by default and useless without a residential
 * proxy (PRD §13); network and auth failures are logged, never thrown at the scheduler.
 */
@ApplicationScoped
class VelobikePoller(
    @param:RestClient private val client: VelobikeClient,
    private val tokenService: VelobikeTokenService,
    private val service: BikeRideService,
    private val config: VelobikeConfig,
) {

    private val log: Logger = Logger.getLogger(VelobikePoller::class.java)

    @Scheduled(every = "{danchuo.bike.poll-interval}", delayed = "30s")
    fun poll() {
        if (!config.pollEnabled()) return
        if (!tokenService.isConnected()) {
            log.debug("velobike poll: не пройден SMS-логин, пропускаю")
            return
        }
        runCatching { pollOnce() }
            .onFailure { log.warn("velobike poll не удался (Qrator/сеть/авторизация?): ${it.message}") }
    }

    /** One polling pass; extracted so [BikeIngestResource] can trigger it by hand. */
    fun pollOnce(): UpsertResult {
        val bearer = tokenService.bearer()
        var page = 0
        var totalCreated = 0
        var totalUpdated = 0
        while (page < MAX_PAGES) {
            val pageData = client.listRents(
                bearer, config.appVersion(), config.source(), LANG,
                config.pollPageSize(), page, STATUSES,
            )
            if (pageData.content.isEmpty()) break
            val res = service.upsert(pageData.content)
            totalCreated += res.created
            totalUpdated += res.updated
            // Caught up (a page with nothing new) or reached the end — stop paging.
            if (res.created == 0 || pageData.last) break
            page++
        }
        if (totalCreated > 0) log.info("velobike poll: +$totalCreated новых поездок (обновлено $totalUpdated)")
        return UpsertResult(totalCreated, totalUpdated)
    }

    private companion object {
        const val STATUSES = "TECH_DONE,DONE"
        const val LANG = "ru"
        const val MAX_PAGES = 50
    }
}
