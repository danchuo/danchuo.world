package world.danchuo.bike

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * Фоновый поллинг истории поездок Велобайка (PRD §9 B4). Тянет страницы `rents/client`,
 * идемпотентно пишет через [BikeRideService]. Инкрементально: как только страница не приносит
 * новых поездок — значит догнали, дальше не листаем (с потолком [MAX_PAGES] на всякий случай).
 *
 * По умолчанию **выключен** ([VelobikeConfig.pollEnabled]) — серверный контур упирается в Qrator
 * (§13), поедет только через резидентный прокси. До этого живёт ручной push-ingest. Ошибки сети/
 * Qrator/авторизации не валят планировщик — логируем и ждём следующего тика.
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

    /** Один проход поллинга; вынесен для ручного триггера из [BikeIngestResource]. */
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
            // Догнали (страница без новых) или дошли до конца — дальше не листаем.
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
