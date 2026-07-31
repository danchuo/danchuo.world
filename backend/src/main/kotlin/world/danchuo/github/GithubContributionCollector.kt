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
 * Фоновый сбор вкладов GitHub в дни (PRD §5.4, реестр I-01). Внешний источник целиком в
 * слайсе: наружу из него уходит только заполненное поле `DayRecord.contributions`.
 *
 * Один заход забирает **год клеток разом** — поэтому первый же прогон дозаполняет всю
 * прошлую историю (как погода из реестра), и чипу не нужно ждать, пока накопятся дни.
 * Писать при этом каждый раз все триста строк не надо: [ContributionWriteFilter] оставляет
 * только изменившееся.
 *
 * **Сбой канала ничего не стирает.** Сеть, страница ошибки, поехавшая разметка — всё это
 * даёт пустой разбор, и тогда прогон просто не пишет (та же доктрина, что «пустой прогон
 * Health не стирает ночь»): «не смогли достать» и «вкладов не было» по данным неразличимы,
 * а первое случается чаще.
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

    /** Один проход: страница → разбор → запись изменившихся дней. Возвращает число записанных. */
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

    /** Что уже лежит в этих днях: `дата → вклады` (`null` = день есть, вклады не собирали). */
    private fun stored(dates: Set<LocalDate>): Map<LocalDate, Int?> {
        if (dates.isEmpty()) return emptyMap()
        return repo.listByDateRange(dates.min(), dates.max())
            .associate { it.date to it.contributions }
    }
}
