package world.danchuo.github

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayRecordRepository
import world.danchuo.days.DayRecordService
import java.time.LocalDate

/**
 * Background collection of GitHub contributions into days; only `DayRecord.contributions` leaves
 * the slice. One pass takes a YEAR of cells, so the very first run backfills history, and
 * [ContributionWriteFilter] narrows it to what changed. AN EMPTY PARSE WRITES NOTHING. PRD §5.15
 */
@ApplicationScoped
class GithubContributionCollector(
    @param:RestClient private val api: GithubContributionsApi,
    private val config: GithubConfig,
    private val days: DayRecordService,
    private val repo: DayRecordRepository,
    private val mskTime: MskTime,
) {

    private val log: Logger = Logger.getLogger(GithubContributionCollector::class.java)

    @Scheduled(every = "{danchuo.github.poll-interval}", delayed = "20s")
    fun collect() {
        if (!config.enabled()) return
        runCatching { collectOnce() }
            .onFailure { log.warn("github: сбор вкладов не удался (сеть/разметка?): ${it.message}") }
    }

    /** One pass: page, parse, write the changed days. Returns how many were written. */
    @Transactional
    fun collectOnce(): Int {
        val html = api.contributions(config.username(), config.userAgent())
        val parsed = ContributionCalendarParser.parse(html)
        if (parsed.isEmpty()) {
            log.warn("github: фрагмент календаря не разобран (${html.length} символов) — ничего не пишу")
            return 0
        }

        val today = mskTime.today()
        val pending = ContributionWriteFilter.pending(parsed, stored(parsed.keys), mskTime.genesis, today)
        pending.forEach { (date, count) -> days.applyContributions(date, count) }

        if (pending.isNotEmpty()) {
            log.info("github: вклады обновлены за ${pending.size} дн. (разобрано ${parsed.size})")
        }
        return pending.size
    }

    /** What those days already hold: `date -> contributions` (`null` = day exists, never collected). */
    private fun stored(dates: Set<LocalDate>): Map<LocalDate, Int?> {
        if (dates.isEmpty()) return emptyMap()
        return repo.listByDateRange(dates.min(), dates.max())
            .associate { it.date to it.contributions }
    }
}
