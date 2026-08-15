package world.danchuo.summary

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import world.danchuo.days.DayRecordService
import java.util.concurrent.atomic.AtomicInteger

/**
 * Очередь пересказов (PRD §5.16): по ОДНОМУ заходу за такт — на все источники разом.
 *
 * По одному — не осторожность, а форма лимита. Бесплатная полоса меряется в токенах в минуту
 * (у llama-3.3 это 12 тысяч), и выдержка в 12 тысяч знаков съедает её почти целиком; два захода
 * подряд упёрлись бы в 429 и потратили бы попытку впустую. **Именно поэтому поллер один на все
 * источники, а не по одному на слайс**: два независимых такта делили бы этот лимит вслепую и
 * мешали бы друг другу ровно тогда, когда обоим есть что рассказать.
 *
 * Спешить при этом некуда: заходов набегает единицы в сутки, а такт — минуты.
 *
 * Промах засчитывается попыткой и не повторяется бесконечно ([ContentSummary]); нечего
 * пересказывать — такт просто молчит.
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
     * С какого источника начинать обход. Двигается каждый такт, чтобы длинная очередь одного
     * источника не заморозила соседний: книг может накопиться на неделю вперёд, и всё это время
     * подкасты не должны молчать.
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

    /** Один такт. `true` — на борде появился новый пересказ. */
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
                // Карточка дня несёт флаг «есть что рассказать» — без сброса кнопка не появилась бы.
                days.invalidateProjection()
            }
            return stored
        }
        return false
    }
}
