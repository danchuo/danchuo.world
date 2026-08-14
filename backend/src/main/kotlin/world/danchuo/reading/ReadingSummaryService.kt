package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmLane
import java.time.Instant

/**
 * Заход, которому пересказ ещё положен: снимок полей сессии, снятый в транзакции, чтобы поход
 * к модели (секунды) шёл уже без открытой транзакции и без прицепленной сущности.
 */
data class SummaryCandidate(
    val sessionId: Long,
    val title: String,
    val author: String?,
    val bookFilePath: String,
    val startPercent: Double,
    val endPercent: Double,
)

/**
 * Пересказ прочитанного куска (PRD §5.16): выбрать заход, вырезать из книги его текст, сходить
 * в модель, записать результат.
 *
 * **Что здесь важнее всего — никогда не рассказывать по памяти.** Текст берётся из epub, который
 * читалка синкает на нашу же полку, и только из него. Нет файла — нет пересказа и нет кнопки на
 * борде (решение владельца): пустое место честнее уверенной выдумки про книгу, которой модель
 * не знает.
 *
 * **Полоса — бесплатная** ([LlmLane.FREE]). Пересказ никуда не спешит: он считается фоном по
 * одной сессии за такт, и его лимит меряется в минуту, а не в скорость. Витринные вызовы
 * (проверка поворота кадра) при этом остаются на основной полосе и его очередью не задеты.
 *
 * Бин отдельный от [ReadingSummaryPoller] по той же причине, что [ReadingService] от
 * [ReadingPoller]: `@Transactional` — это CDI-перехватчик, и на вызове метода того же бина он
 * не срабатывает.
 */
@ApplicationScoped
class ReadingSummaryService(
    private val sessions: ReadingSessionRepository,
    private val summaries: ReadingSummaryRepository,
    private val shelf: AnxShelf,
    private val llm: LlmClient,
    private val config: ReadingConfig,
) {

    private val log: Logger = Logger.getLogger(ReadingSummaryService::class.java)

    /**
     * Следующий заход в очереди — самый свежий из тех, что ещё без пересказа.
     *
     * Свежие вперёд намеренно: борд смотрят с сегодняшнего дня, и пересказ вчерашнего вечера
     * нужен раньше, чем пересказ мартовского. Заходы без обоих процентов и без файла книги в
     * очередь не попадают вовсе — вырезать из книги нечего.
     */
    @Transactional
    fun nextCandidate(): SummaryCandidate? {
        val known = summaries.bySession()
        val limit = config.summary().maxAttempts()
        return sessions.summarisable()
            .firstOrNull { session ->
                val done = known[session.id] ?: return@firstOrNull true
                // Готовое не переспрашиваем никогда, промахнувшееся — пока не выйдут попытки.
                !done.isReady() && done.attempts < limit
            }
            ?.let {
                SummaryCandidate(
                    sessionId = it.id!!,
                    title = it.bookTitle,
                    author = it.bookAuthor,
                    bookFilePath = it.bookFilePath!!,
                    startPercent = it.startPercent!!,
                    endPercent = it.endPercent!!,
                )
            }
    }

    /**
     * Сходить за пересказом куска. `null` — рассказывать нечего: книги нет на полке, файл не
     * разобрался, модель промолчала или отказалась. Транзакции здесь нет намеренно — внутри
     * внешний вызов на секунды.
     */
    fun retell(candidate: SummaryCandidate): Retelling? {
        val file = shelf.bookFile(candidate.bookFilePath) ?: run {
            log.debugf("reading: книги нет на полке (%s)", candidate.bookFilePath)
            return null
        }
        val book = EpubText.read(file) ?: run {
            log.debugf("reading: книгу не разобрать (%s)", candidate.bookFilePath)
            return null
        }

        val from = candidate.startPercent
        val to = candidate.endPercent
        val excerpt = book.excerpt(from, to, config.summary().maxChars())
        if (excerpt.isBlank()) return null

        val context = SummaryContext(
            title = candidate.title,
            author = candidate.author,
            startPercent = from,
            endPercent = to,
            chapters = book.titlesIn(from, to),
        )
        return ReadingSummaryPrompt.parse(
            llm.completeText(ReadingSummaryPrompt.SYSTEM, ReadingSummaryPrompt.user(context, excerpt), LlmLane.FREE),
        )
    }

    /**
     * Записать итог попытки. [retelling] `null` — промах: строка всё равно заводится, потому
     * что она и есть память очереди о попытках. Возвращает `true`, если на борде появилось что
     * показать (и, значит, проекцию дня пора сбросить).
     */
    @Transactional
    fun store(sessionId: Long, retelling: Retelling?, model: String): Boolean {
        val row = summaries.findBySession(sessionId) ?: ReadingSummary().apply {
            this.sessionId = sessionId
            // IDENTITY-генерация вставляет строку немедленно ⇒ not-null поля заполняем ДО persist.
            updatedAt = Instant.now()
            summaries.persist(this)
        }
        row.attempts += 1
        row.updatedAt = Instant.now()
        row.model = model
        if (retelling == null) {
            row.status = ReadingSummaryStatus.FAILED.code()
            return false
        }
        row.status = ReadingSummaryStatus.READY.code()
        row.bullets = retelling.bullets.joinToString("\n")
        row.takeaway = retelling.takeaway
        return true
    }

    // ── чтение ──

    /** Готовый пересказ захода; `null` — его нет либо он не удался. */
    fun readyFor(sessionId: Long): ReadingSummary? =
        summaries.findBySession(sessionId)?.takeIf { it.isReady() }

    /** Из каких заходов пачки есть что рассказать — карточкам дня нужен только этот факт. */
    fun readySessions(sessionIds: Collection<Long>): Set<Long> =
        summaries.listBySessions(sessionIds).filter { it.isReady() }.map { it.sessionId }.toSet()
}
