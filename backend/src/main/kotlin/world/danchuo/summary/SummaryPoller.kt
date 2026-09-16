package world.danchuo.summary

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import world.danchuo.days.DayRecordService
import java.util.concurrent.atomic.AtomicInteger

/**
 * The summary queue: ONE sitting per tick, across all sources at once. One is not caution but the
 * shape of the limit — the free lane is measured in tokens per minute, and a third sitting in the
 * same minute would hit 429 and waste an attempt. Hence one poller, not one per slice. PRD §5.16
 */
@ApplicationScoped
class SummaryPoller(
    private val summaries: SummaryService,
    private val config: SummaryConfig,
    private val days: DayRecordService,
    @param:ConfigProperty(name = "danchuo.llm.free-model") private val freeModel: String,
) {

    private val log: Logger = Logger.getLogger(SummaryPoller::class.java)

    /**
     * Which source the walk starts from. It moves every tick so one source's long queue cannot
     * freeze its neighbour: books can pile up for a week, and podcasts must not go silent
     * throughout.
     */
    private val cursor = AtomicInteger(0)

    @Scheduled(
        every = "{danchuo.summary.interval}",
        delayed = "90s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.enabled()) return
        runCatching { pollOnce() }
            .onFailure { log.warn("summary: пересказ не собрался: ${it.message}") }
    }

    /** One tick. `true` when a new summary appeared on the board. */
    fun pollOnce(): Boolean {
        val sources = summaries.sources()
        if (sources.isEmpty()) return false

        val start = cursor.getAndIncrement()
        for (i in sources.indices) {
            val source = sources[Math.floorMod(start + i, sources.size)]
            val target = summaries.nextTarget(source) ?: continue

            val retelling = summaries.retell(source, target)
            val stored = summaries.store(target, retelling, freeModel)
            if (stored) {
                log.infof(
                    "summary: пересказ готов (%s #%d, «%s»)",
                    target.kind.code(),
                    target.sessionId,
                    target.title,
                )
                // The day card carries the "has something to tell" flag — without dropping the
                // cache the button would never appear.
                days.invalidateProjection()
            } else {
                // A miss is logged HERE, not only in the source: a break at the model (retirement
                // by the provider, a rate limit) never reaches the source and left no trace at the
                // queue level. Which sitting a 404 cost a button for had to be dug out of the DB.
                log.infof(
                    "summary: пересказ не вышел (%s #%d, «%s») — попытка засчитана",
                    target.kind.code(),
                    target.sessionId,
                    target.title,
                )
            }
            return stored
        }
        return false
    }
}
