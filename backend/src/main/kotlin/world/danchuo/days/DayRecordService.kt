package world.danchuo.days

import io.quarkus.cache.CacheInvalidateAll
import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.config.MskTime
import java.time.Clock
import java.time.Instant
import java.time.LocalDate

/**
 * The single write point for [DayRecord]: slices never touch a day directly but go through the
 * narrow methods here, which hold the cross-cutting invariants — genesis guard, find-or-create by
 * date, `created/updatedAt`. Addressing by date is what makes ingest idempotent. PRD §3.1, §4
 */
@ApplicationScoped
class DayRecordService(
    private val repo: DayRecordRepository,
    private val mskTime: MskTime,
    private val clock: Clock,
    private val ingestStatus: IngestStatusService,
) {

    /**
     * Applies the day's health stats; `null` means "no data", 0 means a real zero. Drops the
     * `day-view` cache, as any intake can shift a streak. [overwriteSleep] `false` keeps stored
     * sleep: an empty Health run is indistinguishable from "did not sleep" and used to WIPE it.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyHealth(
        date: LocalDate,
        steps: Int?,
        sleepMinutes: Int?,
        sleepRem: Int?,
        sleepDeep: Int?,
        sleepLight: Int?,
        sleepAwake: Int?,
        overwriteSleep: Boolean = true,
    ): DayRecord = upsert(date) { day ->
        day.steps = steps
        if (overwriteSleep) {
            day.sleepMinutes = sleepMinutes
            day.sleepRemMinutes = sleepRem
            day.sleepDeepMinutes = sleepDeep
            day.sleepLightMinutes = sleepLight
            day.sleepAwakeMinutes = sleepAwake
        }
    }

    /**
     * Drops the day projection when a NEIGHBOURING slice changed it without touching `day_record`
     * — the podcast poller writes its sessions and a checklist mark, yet [DayView] depends on
     * both. Called only when minutes actually grew: invalidation costs the next reader a scan.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun invalidateProjection() = Unit

    /**
     * Records measured journal minutes. A separate method rather than a field in [applyHealth]
     * because it addresses a DIFFERENT day: the minutes belong to an evening bucket, so one Health
     * run closes several days. Called only for days with segments, so an empty run erases nothing.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyJournalMinutes(date: LocalDate, minutes: Int): DayRecord = upsert(date) { day ->
        day.journalMinutes = minutes
    }

    /**
     * Records GitHub contributions for a day, called by the `github` collector. [markFresh] is
     * `false` on purpose: the freshness lamp answers "when did the PHONE last send data", and a
     * collector reaching out every half hour would hold it at "just now" forever. PRD §5.4, §8
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyContributions(date: LocalDate, contributions: Int): DayRecord =
        upsert(date, markFresh = false) { day ->
            day.contributions = contributions
        }

    /**
     * Applies the day's manual meta (PRD §5.6): the day name and activities. Drops the `day-view` projection
     * cache — `ingest/daily` always passes through here, so the invalidation also covers the
     * discipline marks written by the same request, and streaks recompute.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyDailyMeta(date: LocalDate, title: String?, activities: List<String>): DayRecord =
        upsert(date) { day ->
            day.title = title?.takeIf { it.isNotBlank() }
            day.activities = activities.toMutableList()
        }

    /** Records that the day's photo was (re)stored, with its web size. [DayPhotoService] */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyPhoto(date: LocalDate, width: Int, height: Int): DayRecord = upsert(date) { day ->
        day.photoWidth = width
        day.photoHeight = height
        day.photoUpdatedAt = Instant.now(clock)
    }

    /**
     * Find-or-create by date with the genesis guard, applies [mutate], bumps `updatedAt`. Every
     * public method is expressed through it, so the invariants stay in one place. [markFresh] is
     * `true` for intake channels from the phone and `false` for scheduled background collectors.
     */
    private inline fun upsert(
        date: LocalDate,
        markFresh: Boolean = true,
        mutate: (DayRecord) -> Unit,
    ): DayRecord {
        if (date.isBefore(mskTime.genesis)) {
            throw DateBeforeGenesisException(date, mskTime.genesis)
        }
        val now = Instant.now(clock)
        val day = repo.findByDate(date) ?: DayRecord().apply {
            this.date = date
            createdAt = now
            updatedAt = now
            repo.persist(this)
        }
        mutate(day)
        day.updatedAt = now
        // Data freshness (PRD §8): a successful INGEST moves the singleton mark. Doing it here,
        // at the single write point, counts both channels (health and discipline) without dupes.
        if (markFresh) ingestStatus.markIngest(now)
        return day
    }
}
