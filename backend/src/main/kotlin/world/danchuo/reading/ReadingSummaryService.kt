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
     * Следующий заход в очереди — самый свежий из тех, кому пересказ ещё нужен.
     *
     * Свежие вперёд намеренно: борд смотрят с сегодняшнего дня, и пересказ вчерашнего вечера
     * нужен раньше, чем пересказ мартовского. Заходы без обоих процентов и без файла книги в
     * очередь не попадают вовсе — вырезать из книги нечего.
     */
    @Transactional
    fun nextCandidate(): SummaryCandidate? {
        val known = summaries.bySession()
        return sessions.summarisable()
            .firstOrNull { queued(it, known[it.id]) }
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
     * Нужен ли заходу поход к модели.
     *
     * Три случая, и все три — про «что уже рассказано», а не про «сколько раз пробовали»:
     * - **строки нет** — пересказа не было вовсе, берём;
     * - **успеха не было** — берём, пока не вышли попытки;
     * - **пересказ есть, но заход дорос** — берём: вернувшись к книге в пределах паузы, владелец
     *   продлевает ТУ ЖЕ строку сессии, и текст про её начало перестаёт отвечать за неё целиком
     *   (карточка сказала бы «10% → 30%» над пунктами, которые видели 15%).
     *
     * Порог [ReadingConfig.Summary.refreshPercent] не косметика: без него округление процента
     * гоняло бы модель по кругу за пару абзацев, выжигая бесплатный лимит.
     *
     * Счётчик попыток держит решение «сдаюсь» только про ТУ цель, на которую целились. Заход,
     * доросший дальше, — новая цель, и счёт начинается заново: прежний отказ был про другой кусок.
     */
    private fun queued(session: ReadingSession, known: ReadingSummary?): Boolean {
        val end = session.endPercent ?: return false
        if (known == null) return true

        val refresh = config.summary().refreshPercent()
        val newTarget = known.targetEndPercent?.let { end - it >= refresh } ?: true
        if (!newTarget && known.attempts >= config.summary().maxAttempts()) return false
        if (!known.isReady()) return true
        return end - (known.coveredEndPercent ?: 0.0) >= refresh
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
     * Записать итог попытки по [candidate]. [retelling] `null` — промах: строка всё равно
     * заводится, потому что она и есть память очереди о попытках. Возвращает `true`, если на
     * борде появилось что показать (и, значит, проекцию дня пора сбросить).
     *
     * **Промах не стирает того, что уже рассказано.** Освежение — это попытка рассказать про
     * заход, который дорос; не вышло — на карточке остаётся прежний текст (он про меньший
     * кусок, но он правдив), а не пустое место вместо кнопки.
     */
    @Transactional
    fun store(candidate: SummaryCandidate, retelling: Retelling?, model: String): Boolean {
        val row = summaries.findBySession(candidate.sessionId) ?: ReadingSummary().apply {
            sessionId = candidate.sessionId
            // IDENTITY-генерация вставляет строку немедленно ⇒ not-null поля заполняем ДО persist.
            updatedAt = Instant.now()
            summaries.persist(this)
        }

        // Счёт промахов ведётся по ЦЕЛИ: сменилась — начинаем заново (см. `queued`).
        val newTarget = row.targetEndPercent?.let {
            candidate.endPercent - it >= config.summary().refreshPercent()
        } ?: true
        row.attempts = if (newTarget) 1 else row.attempts + 1
        row.targetEndPercent = candidate.endPercent
        row.updatedAt = Instant.now()

        if (retelling == null) {
            // Уже рассказанное переживает неудачное освежение — статус и текст остаются прежними.
            if (!row.isReady()) row.status = ReadingSummaryStatus.FAILED.code()
            return false
        }
        row.model = model
        row.status = ReadingSummaryStatus.READY.code()
        row.bullets = retelling.bullets.joinToString("\n")
        row.takeaway = retelling.takeaway
        row.coveredStartPercent = candidate.startPercent
        row.coveredEndPercent = candidate.endPercent
        row.attempts = 0
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
