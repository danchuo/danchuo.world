package world.danchuo.summary

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Instance
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmLane
import java.time.Instant

/**
 * Пересказ пройденного за заход куска (PRD §5.16): выбрать заход, взять у источника его текст,
 * сходить в модель, записать результат.
 *
 * **Что здесь важнее всего — никогда не рассказывать по памяти.** Текст берётся у источника
 * ([SummarySource]) и только у него. Нет текста — нет пересказа и нет кнопки на борде (решение
 * владельца): пустое место честнее уверенной выдумки про книгу, которой модель не знает.
 *
 * **Полоса — бесплатная** ([LlmLane.FREE]). Пересказ никуда не спешит: он считается фоном по
 * одному заходу за такт, и его лимит меряется в минуту, а не в скорость. Витринные вызовы
 * (проверка поворота кадра) при этом остаются на основной полосе и его очередью не задеты.
 *
 * Бин отдельный от [SummaryPoller] не для красоты: `@Transactional` — это CDI-перехватчик, и на
 * вызове метода того же бина он не срабатывает.
 */
@ApplicationScoped
class SummaryService(
    private val sources: Instance<SummarySource>,
    private val summaries: ContentSummaryRepository,
    private val llm: LlmClient,
    private val config: SummaryConfig,
) {

    private val log: Logger = Logger.getLogger(SummaryService::class.java)

    /** Настроенные источники в стабильном порядке — по ним поллер ходит по кругу. */
    fun sources(): List<SummarySource> = sources.filter { it.isConfigured() }.sortedBy { it.kind().ordinal }

    /**
     * Следующий заход этого источника — самый свежий из тех, кому пересказ ещё нужен. Порядок
     * задаёт сам источник ([SummarySource.candidates]); здесь только отсев по тому, что уже
     * рассказано ([SummaryPolicy]).
     */
    @Transactional
    fun nextTarget(source: SummarySource): SummaryTarget? {
        val known = summaries.bySession(source.kind())
        return source.candidates().firstOrNull {
            SummaryPolicy.queued(
                end = it.to,
                known = known[it.sessionId]?.state(),
                refresh = config.refreshFraction(),
                maxAttempts = config.maxAttempts(),
            )
        }
    }

    /**
     * Сходить за пересказом куска. `null` — рассказывать нечего: источник не дал текста, модель
     * промолчала или отказалась. Транзакции здесь нет намеренно — внутри внешние вызовы на
     * секунды (файл, сеть, модель).
     */
    fun retell(source: SummarySource, target: SummaryTarget): Retelling? {
        val excerpt = source.excerpt(target) ?: run {
            log.debugf("summary: текста нет (%s #%d)", target.kind.code(), target.sessionId)
            return null
        }
        if (excerpt.text.isBlank()) return null

        val capped = excerpt.copy(text = SummaryWindows.cap(excerpt.text, config.maxChars()))
        return SummaryPrompt.parse(
            llm.completeText(
                SummaryPrompt.system(target.kind),
                SummaryPrompt.user(target, capped),
                LlmLane.FREE,
            ),
        )
    }

    /**
     * Записать итог попытки по [target]. [retelling] `null` — промах: строка всё равно заводится,
     * потому что она и есть память очереди о попытках. Возвращает `true`, если на борде появилось
     * что показать (и, значит, проекцию дня пора сбросить).
     *
     * **Промах не стирает того, что уже рассказано.** Освежение — это попытка рассказать про
     * заход, который дорос; не вышло — на карточке остаётся прежний текст (он про меньший кусок,
     * но он правдив), а не пустое место вместо кнопки.
     */
    @Transactional
    fun store(target: SummaryTarget, retelling: Retelling?, model: String): Boolean {
        val row = summaries.findBy(target.kind, target.sessionId) ?: ContentSummary().apply {
            kind = target.kind.code()
            sessionId = target.sessionId
            // IDENTITY-генерация вставляет строку немедленно ⇒ not-null поля заполняем ДО persist.
            updatedAt = Instant.now()
            summaries.persist(this)
        }

        // Счёт промахов ведётся по ЦЕЛИ: сменилась — начинаем заново (см. SummaryPolicy).
        row.attempts = SummaryPolicy.attemptsAfter(row.state(), target.to, config.refreshFraction())
        row.targetEnd = target.to
        row.updatedAt = Instant.now()

        if (retelling == null) {
            // Уже рассказанное переживает неудачное освежение — статус и текст остаются прежними.
            if (!row.isReady()) row.status = SummaryStatus.FAILED.code()
            return false
        }
        row.model = model
        row.status = SummaryStatus.READY.code()
        row.bullets = retelling.bullets.joinToString("\n")
        row.takeaway = retelling.takeaway
        row.coveredStart = target.from
        row.coveredEnd = target.to
        row.attempts = 0
        return true
    }

    // ── чтение ──

    /** Готовый пересказ захода; `null` — его нет либо он не удался. */
    fun readyFor(kind: SummaryKind, sessionId: Long): ContentSummary? =
        summaries.findBy(kind, sessionId)?.takeIf { it.isReady() }

    /** Из каких заходов пачки есть что рассказать — карточкам дня нужен только этот факт. */
    fun readySessions(kind: SummaryKind, sessionIds: Collection<Long>): Set<Long> =
        summaries.listBy(kind, sessionIds).filter { it.isReady() }.map { it.sessionId }.toSet()
}
