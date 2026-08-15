package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.summary.SummaryExcerpt
import world.danchuo.summary.SummaryKind
import world.danchuo.summary.SummarySource
import world.danchuo.summary.SummaryTarget

/**
 * Откуда берётся текст прочитанного куска (PRD §5.16) — половина пересказа, знающая про книги.
 *
 * Вторая половина (очередь, счётчик попыток, промпт, разбор ответа) живёт в слайсе `summary` и
 * про epub ничего не знает. Разделение проходит ровно по правилу вертикальных слайсов: полка
 * Anx, WebDAV и разбор epub — внешний источник, и он остаётся здесь целиком.
 *
 * **Текст только из файла книги.** Читалка синкает epub вместе со своей базой, а доли сессии
 * говорят, какой кусок вырезать. Пересказ «по памяти модели» рассмотрен и отклонён: на публичном
 * борде он однажды уверенно соврал бы про книгу, которой модель не знает, и отличить это на
 * странице было бы нечем. Нет файла — нет пересказа и нет кнопки.
 */
@ApplicationScoped
class ReadingSummarySource(
    private val sessions: ReadingSessionRepository,
    private val shelf: AnxShelf,
    private val config: ReadingConfig,
) : SummarySource {

    private val log: Logger = Logger.getLogger(ReadingSummarySource::class.java)

    override fun kind(): SummaryKind = SummaryKind.READING

    /** Без настроенной полки резать нечего — это нормальное состояние, а не поломка. */
    override fun isConfigured(): Boolean = config.isConfigured()

    /**
     * Заходы, из которых МОЖНО вырезать кусок: известен файл на полке и оба конца пути по долям.
     * Порядок задаёт запрос — свежие вперёд.
     *
     * Транзакция здесь и заканчивается: наружу уходит снимок, а не прицепленные сущности, чтобы
     * поход к модели (секунды) шёл уже без открытой транзакции.
     */
    @Transactional
    override fun candidates(): List<SummaryTarget> = sessions.summarisable().map {
        SummaryTarget(
            kind = SummaryKind.READING,
            sessionId = it.id!!,
            title = it.bookTitle,
            byline = it.bookAuthor,
            from = it.startPercent!!,
            to = it.endPercent!!,
            ref = it.bookFilePath,
        )
    }

    /**
     * Кусок книги между долями захода. `null` — книги нет на полке, файл не разобрался или окно
     * пустое: всё это значит одно — пересказывать нечего.
     *
     * Потолок выдержки здесь не применяется: ужать текст под лимит модели — дело ядра
     * ([world.danchuo.summary.SummaryWindows]), которое одно знает, каков этот лимит.
     */
    override fun excerpt(target: SummaryTarget): SummaryExcerpt? {
        val path = target.ref ?: return null
        val file = shelf.bookFile(path) ?: run {
            log.debugf("reading: книги нет на полке (%s)", path)
            return null
        }
        val book = EpubText.read(file) ?: run {
            log.debugf("reading: книгу не разобрать (%s)", path)
            return null
        }

        val text = book.excerpt(target.from, target.to)
        if (text.isBlank()) return null
        return SummaryExcerpt(text = text, sections = book.titlesIn(target.from, target.to))
    }
}
