package world.danchuo.reading

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayRecordService
import java.time.Instant

/**
 * Background pull of reading from the Anx shelf; only sessions and the derived mark leave the
 * slice. A missed tick loses nothing — unlike podcasts, the minutes are already counted inside
 * the file and credit is the difference against what is recorded. Why a poll at all: PRD §5.16.
 */
@ApplicationScoped
class ReadingPoller(
    private val shelf: AnxShelf,
    private val reading: ReadingService,
    private val config: ReadingConfig,
    private val days: DayRecordService,
    private val mskTime: MskTime,
) {

    private val log: Logger = Logger.getLogger(ReadingPoller::class.java)

    @Scheduled(
        every = "{danchuo.reading.poll-interval}",
        delayed = "30s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.enabled() || !config.isConfigured()) return
        runCatching { pollOnce() }
            .onFailure { log.warn("reading: полку прочитать не удалось: ${it.message}") }
    }

    /** One pass. Returns the credited seconds: 0 when the shelf has not changed or is absent. */
    fun pollOnce(): Int {
        // No shelf yet — the phone has never synced. That is a normal state, not a breakage.
        val snapshot = shelf.snapshot() ?: return 0
        val credited = reading.absorb(snapshot, mskTime.today(), Instant.now())
        // The day projection depends on minutes and cards; drop it only once they have moved.
        if (credited > 0) days.invalidateProjection()
        return credited
    }
}
