package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.summary.SummaryExcerpt
import world.danchuo.summary.SummaryKind
import world.danchuo.summary.SummarySource
import world.danchuo.summary.SummaryTarget

/**
 * Where the text of a read passage comes from — the half of summarising that knows about books;
 * the queue, prompt and parsing live in `summary` and know nothing of epub. The text comes ONLY
 * from the book file: no file on the shelf, no summary and no button. PRD §5.16
 */
@ApplicationScoped
class ReadingSummarySource(
    private val sessions: ReadingSessionRepository,
    private val shelf: AnxShelf,
    private val config: ReadingConfig,
) : SummarySource {

    private val log: Logger = Logger.getLogger(ReadingSummarySource::class.java)

    override fun kind(): SummaryKind = SummaryKind.READING

    /** With no shelf configured there is nothing to cut — a normal state, not a breakage. */
    override fun isConfigured(): Boolean = config.isConfigured()

    /**
     * Sittings a passage CAN be cut from: the shelf file is known and both ends of the path in
     * fractions are set, newest first. The transaction ends here — a snapshot leaves rather than
     * attached entities, so the trip to the model runs with no transaction open.
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
     * The slice of the book between a sitting's fractions. `null` covers every case that means
     * the same thing: no book on the shelf, an unparsable file, an empty window. The excerpt
     * ceiling is NOT applied here — only the summary core knows what that limit is.
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
