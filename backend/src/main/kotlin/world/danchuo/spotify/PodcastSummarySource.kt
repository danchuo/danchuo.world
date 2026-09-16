package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.llm.LlmAudio
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmLane
import world.danchuo.summary.SummaryExcerpt
import world.danchuo.summary.SummaryKind
import world.danchuo.summary.SummarySource
import world.danchuo.summary.SummaryTarget
import world.danchuo.summary.SummaryWindows

/**
 * Where the text of a listened passage comes from — the half of summarising that knows podcasts.
 * No ready transcripts exist, so the path is Apple catalogue, RSS, `Range` windows, then speech
 * recognition. Spotify exclusives have no open RSS and simply get no button. PRD §5.16.1
 */
@ApplicationScoped
class PodcastSummarySource(
    private val sessions: PodcastSessionRepository,
    private val listens: PodcastListenService,
    private val audio: PodcastAudioClient,
    private val llm: LlmClient,
    private val config: SpotifyConfig,
    private val mskTime: MskTime,
) : SummarySource {

    private val log: Logger = Logger.getLogger(PodcastSummarySource::class.java)

    override fun kind(): SummaryKind = SummaryKind.PODCAST

    override fun isConfigured(): Boolean = config.podcast().summary().enabled()

    /**
     * Sittings a passage CAN be cut from: both ends of the window inside the episode are known,
     * along with its duration, newest first. Rows predating the start column never qualify —
     * inventing a beginning would be the same lie as summarising from memory. PRD §5.16.1
     */
    @Transactional
    override fun candidates(): List<SummaryTarget> {
        val gap = config.podcast().runGapMinutes()
        return sessions.datesWithWindow(mskTime.today(), HISTORY_DAYS).flatMap { date ->
            PodcastDayRollup.runs(listens.runsOn(date), gap).mapNotNull(::targetOf)
        }
    }

    /**
     * A sitting turned into a queue target; `null` when there is nothing to cut. Fractions are
     * taken from the EPISODE'S duration while the byte binding comes from file size
     * ([AudioWindows]), so drift between Spotify's duration and the feed's never accumulates.
     */
    private fun targetOf(run: PodcastRun): SummaryTarget? {
        val duration = run.episodeDurationMs?.takeIf { it > 0 } ?: return null
        val start = run.startProgressMs ?: return null
        val end = run.lastProgressMs
        if (end <= start) return null

        return SummaryTarget(
            kind = SummaryKind.PODCAST,
            sessionId = run.sessionId,
            title = run.episodeName,
            byline = run.showName,
            from = (start.toDouble() / duration).coerceIn(0.0, 1.0),
            to = (end.toDouble() / duration).coerceIn(0.0, 1.0),
            // The duration is needed while fetching: it matches the episode in the feed and sizes the windows.
            ref = duration.toString(),
        )
    }

    /**
     * Text of the listened stretch. `null` at any step of the path — no feed, unrecognised
     * episode, a host that will not serve chunks, silent transcription — all mean the same: there
     * is nothing to tell, and the queue honestly counts a miss.
     */
    override fun excerpt(target: SummaryTarget): SummaryExcerpt? {
        val duration = target.ref?.toLongOrNull()?.takeIf { it > 0 } ?: return null
        val show = target.byline ?: return null

        // A break at any step is logged as ONE clear line at info, not debug. A sitting gets at
        // most three attempts, so this never becomes noise, while "why has this episode no
        // button" is readable from the logs instead of needing a debugging session.
        fun give(reason: String): SummaryExcerpt? {
            log.infof("podcast: пересказ не собрать («%s» / «%s»): %s", show, target.title, reason)
            return null
        }

        val feedUrl = audio.feedUrl(show) ?: return give("фид шоу не найден в каталоге")
        val feed = audio.feed(feedUrl) ?: return give("фид не доехал ($feedUrl)")
        val enclosure = PodcastFeedParser.enclosureFor(feed, target.title, duration)
            ?: return give("выпуск не опознан в фиде $feedUrl")

        val remote = audio.probe(enclosure) ?: return give("раздача не отдаёт куски ($enclosure)")
        val settings = config.podcast().summary()
        val windows = AudioWindows.windows(
            totalBytes = remote.totalBytes,
            durationMs = duration,
            from = target.from,
            to = target.to,
            count = settings.windows(),
            windowMs = settings.windowMs(),
        ).filter { it.length in 1..settings.maxSliceBytes() }
        if (windows.isEmpty()) return give("окно прослушанного пустое или не влезает в потолок куска")

        val parts = windows.mapNotNull { transcribe(remote, it) }
        if (parts.isEmpty()) return give("ни одно окно не расшифровалось (${windows.size} шт.)")

        // Gaps between windows carry the same marker as a book's: the model must see the break
        // rather than invent a bridge across it.
        val text = parts.joinToString(SummaryWindows.GAP)
        log.infof(
            "podcast: расшифровано %d окон выпуска «%s» (%d знаков)",
            parts.size,
            target.title,
            text.length,
        )
        return SummaryExcerpt(text = text)
    }

    /** One window: download the chunk and transcribe it. `null` when either did not work out. */
    private fun transcribe(remote: RemoteAudio, window: ByteWindow): String? {
        val bytes = audio.slice(remote.url, window) ?: return null
        return llm.transcribe(
            LlmAudio(bytes = bytes, mediaType = AUDIO_TYPE, fileName = AUDIO_NAME),
            LlmLane.FREE,
        )?.trim()?.ifBlank { null }
    }

    private companion object {
        /**
         * How far back the queue looks. There is no point going further: the window-start column
         * is recent, and older sittings will not get a summary anyway.
         */
        const val HISTORY_DAYS = 60L

        /**
         * A slice of the stream, not a whole file — but mp3 specifically (every host checked
         * serves it). The name is load-bearing: transcription reads the format off the extension
         * and rejects a nameless part.
         */
        const val AUDIO_TYPE = "audio/mpeg"
        const val AUDIO_NAME = "slice.mp3"
    }
}
