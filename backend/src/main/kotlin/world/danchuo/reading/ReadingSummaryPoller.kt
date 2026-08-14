package world.danchuo.reading

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import world.danchuo.days.DayRecordService

/**
 * Очередь пересказов прочитанного (PRD §5.16): по ОДНОМУ заходу за такт.
 *
 * По одному — не осторожность, а форма лимита. Бесплатная полоса меряется в токенах в минуту
 * (у llama-3.3 это 12 тысяч), и выдержка в 12 тысяч знаков съедает её почти целиком; два захода
 * подряд упёрлись бы в 429 и потратили бы попытку впустую. Спешить при этом некуда: сессий
 * набегает единицы в сутки, а такт — минуты.
 *
 * Промах засчитывается попыткой и не повторяется бесконечно ([ReadingSummary]); нечего
 * пересказывать (нет ни одного захода с файлом книги) — такт просто молчит.
 */
@ApplicationScoped
class ReadingSummaryPoller(
    private val summaries: ReadingSummaryService,
    private val config: ReadingConfig,
    private val days: DayRecordService,
    @param:ConfigProperty(name = "danchuo.llm.free-model") private val freeModel: String,
) {

    private val log: Logger = Logger.getLogger(ReadingSummaryPoller::class.java)

    @Scheduled(
        every = "{danchuo.reading.summary.interval}",
        delayed = "90s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.summary().enabled() || !config.isConfigured()) return
        runCatching { pollOnce() }
            .onFailure { log.warn("reading: пересказ не собрался: ${it.message}") }
    }

    /** Один такт. `true` — на борде появился новый пересказ. */
    fun pollOnce(): Boolean {
        val candidate = summaries.nextCandidate() ?: return false
        val retelling = summaries.retell(candidate)
        val stored = summaries.store(candidate.sessionId, retelling, freeModel)
        if (stored) {
            log.infof("reading: пересказ готов (сессия %d, «%s»)", candidate.sessionId, candidate.title)
            // Карточка дня несёт флаг «есть что рассказать» — без сброса кнопка не появилась бы.
            days.invalidateProjection()
        }
        return stored
    }
}
