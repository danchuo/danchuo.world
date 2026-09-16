package world.danchuo.days

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import world.danchuo.core.config.MskTime
import world.danchuo.health.WorkoutRepository
import world.danchuo.reading.ReadingDayRollup
import world.danchuo.reading.ReadingService
import world.danchuo.reading.ReadingSession
import world.danchuo.summary.SummaryKind
import world.danchuo.summary.SummaryService
import world.danchuo.spotify.PodcastDayRollup
import world.danchuo.spotify.PodcastListenService
import world.danchuo.spotify.PodcastRun
import java.time.LocalDate

/**
 * Builds the read projections [DayView]/[DaySummary] from the `days`, `health` and `checklist`
 * slices, reading neighbours through their public repositories rather than their tables. Read
 * only; a missing record is an empty day, not an error, and the response shape is the same. §5.4
 */
@ApplicationScoped
class DayAggregator(
    private val days: DayRecordRepository,
    private val workouts: WorkoutRepository,
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
    private val podcasts: PodcastListenService,
    private val reading: ReadingService,
    private val summaries: SummaryService,
    private val mskTime: MskTime,
) {

    /**
     * Full day projection; an empty day is a valid one. [today] is a parameter rather than
     * `mskTime.today()` inside because it belongs to the CACHE KEY: "today" has to expire at MSK
     * midnight, and the streak rule differs once that same day is viewed as past. PRD §5.6
     */
    @CacheResult(cacheName = "day-view")
    fun viewOf(date: LocalDate, today: LocalDate): DayView {
        val items = checklistItems.listActive()
        // Lazy history window for streaks (read backwards in batches until the first break), one
        // for every item and for the monster. Its first page already holds the day's own rows.
        val history = DayHistory(date, mskTime.genesis, days, checklistEntries)
        val record = history.record(date)

        // The day's listening is read ONCE per projection: minutes and cards are both folds of
        // the same set of sessions, and the podcast item appears exactly once in the list.
        val podcastRuns = podcasts.runsOn(date)
        val podcastMinutes = PodcastDayRollup.listenedMinutes(podcastRuns.sumOf { it.listenedMs })
        // Episode minutes across the whole day — the denominator of the card's per-day line.
        // Which sessions have a summary (§5.16.1) comes in one query per day, as with reading.
        val retoldRuns = summaries.readySessions(SummaryKind.PODCAST, podcastRuns.map { it.sessionId })

        // The day's reading, read once for the same reason: minutes and cards are folds of one
        // set of sessions, and the reading item appears exactly once in the list.
        val readingSessions = reading.sessionsOn(date)
        val readingMinutes = ReadingDayRollup.minutes(readingSessions.sumOf { it.readSeconds })
        // Which sessions have something to tell (§5.16), in ONE query per day: the summary text
        // stays out — the card only needs to know the button has something to open.
        val retoldSessions = summaries.readySessions(SummaryKind.READING, readingSessions.mapNotNull { it.id })

        val discipline = items.map { item ->
            val itemId = item.id!!
            // Streak per EVERY stop: occurrence k (1..target) is closed by days with count >= k.
            // Weekends are NEUTRAL for discipline — a weekend neither counts into a run nor
            // breaks it, so the streak steps over it (§5.6).
            val occurrenceStreaks = (1..item.target).map { k ->
                StreakCalculator.streak(date, today, mskTime.genesis, isNeutral = ::isWeekend) { d ->
                    history.count(d, itemId) >= k
                }
            }
            DisciplineItemView(
                key = item.key,
                label = item.label,
                icon = item.icon,
                count = history.count(date, itemId),
                target = item.target,
                occurrenceStreaks = occurrenceStreaks,
                // Two items are measured: journal by "Journal" app minutes, podcasts by the
                // player poller (§5.6). Derived items know themselves by key, exactly as ingest
                // knows `monster`; the rest of the list stays data-driven.
                measuredMinutes = when (item.key) {
                    JOURNAL_ITEM_KEY -> record?.journalMinutes
                    // Zero minutes means "did not listen", not a measurement: stay silent.
                    PODCAST_ITEM_KEY -> podcastMinutes.takeIf { it > 0 }
                    // Reading is measured the same way, in minutes off the reader shelf (§5.16).
                    READING_ITEM_KEY -> readingMinutes.takeIf { it > 0 }
                    else -> null
                },
                episodes = if (item.key == PODCAST_ITEM_KEY) {
                    PodcastDayRollup.cards(podcastRuns, item.target)
                        .map { episodeViewOf(it, retoldRuns) }
                } else {
                    emptyList()
                },
                books = if (item.key == READING_ITEM_KEY) {
                    ReadingDayRollup.cards(readingSessions, item.target)
                        .map { readingBookViewOf(it, retoldSessions) }
                } else {
                    emptyList()
                },
            )
        }

        // The monster lives entirely in its item's mark: `ingest/daily` ALWAYS writes it (1 drunk,
        // 0 clean), so the presence of the ROW means the shortcut ran that day and its absence
        // means it did not. That difference is what gives the third answer (see DayView).
        val monsterItemId = items.firstOrNull { it.key == MONSTER_ITEM_KEY }?.id
        fun drunkOn(d: LocalDate): Boolean? =
            if (monsterItemId == null || !history.hasEntry(d, monsterItemId)) null
            else history.count(d, monsterItemId) >= 1

        // Inverse "clean" streak: a day counts only if monster WAS marked and not drunk. The
        // divider is the mark, not the day record — auto health ingest creates the record at
        // 12/18/24 MSK, so today would count before the shortcut ran. Unmarked = break. §5.6
        val monsterCleanStreak = StreakCalculator.streak(date, today, mskTime.genesis) { d ->
            drunkOn(d) == false
        }

        return DayView(
            date = date,
            title = record?.title,
            hasData = record != null,
            health = HealthView(
                steps = record?.steps,
                sleepMinutes = record?.sleepMinutes,
                sleepStages = record?.let(::stagesOf),
            ),
            workouts = workouts.listByDate(date).map {
                WorkoutView(it.type, it.durationMinutes, it.activeEnergyKcal, it.distanceMeters)
            },
            discipline = discipline,
            monsterDrunk = drunkOn(date),
            monsterCleanStreak = monsterCleanStreak,
        )
    }

    /**
     * Summaries over the continuous range `[from, to]` for the calendar and the mini chart. Days
     * without a record come back as empty summaries, so the grid draws with no holes (§4).
     * Neighbours load in batches (records and marks one query each), never N+1 per day.
     */
    fun summaries(from: LocalDate, to: LocalDate): List<DaySummary> {
        val items = checklistItems.listActive()
        val records = days.listByDateRange(from, to).associateBy { it.date }
        val entriesByDate = checklistEntries.listByDateRange(from, to).groupBy { it.date }
        val monsterItemId = items.firstOrNull { it.key == MONSTER_ITEM_KEY }?.id

        return generateSequence(from) { if (it < to) it.plusDays(1) else null }
            .map { date ->
                val record = records[date]
                // `counts` maps only REAL rows, so a missing key separates "never marked" from
                // "marked zero", which is the honest "did not drink".
                val counts = entriesByDate[date].orEmpty().associate { it.itemId to it.count }
                val monsterDrunk = monsterItemId?.let { id -> counts[id]?.let { it >= 1 } }

                DaySummary(
                    date = date,
                    title = record?.title,
                    hasData = record != null,
                    steps = record?.steps,
                    sleepMinutes = record?.sleepMinutes,
                    contributions = record?.contributions,
                    // Keys come from active items, not just marked ones: the lens must tell
                    // "item exists, not done" from "no such item".
                    disciplineCounts = items.associate { it.key to (counts[it.id] ?: 0) },
                    monsterDrunk = monsterDrunk,
                )
            }
            .toList()
    }

    /** Session card: the fold's milliseconds become minutes only on the way out. */
    private fun episodeViewOf(run: PodcastRun, retold: Set<Long>): PodcastEpisodeView {
        // The stretch covered needs both bounds or neither: an end without a start answers no
        // question at all (the same rule as the book percentages).
        val start = run.startProgressMs?.let { PodcastDayRollup.listenedMinutes(it) }
        val end = start?.let { PodcastDayRollup.listenedMinutes(run.lastProgressMs) }

        return PodcastEpisodeView(
            episodeName = run.episodeName,
            episodeUrl = run.episodeUrl,
            showName = run.showName,
            showUrl = run.showUrl,
            imageUrl = run.imageUrl,
            listenedMinutes = PodcastDayRollup.listenedMinutes(run.listenedMs),
            startMinute = start,
            endMinute = end,
            durationMinutes = run.episodeDurationMs?.let { PodcastDayRollup.listenedMinutes(it) },
            sessionId = run.sessionId,
            hasSummary = run.sessionId in retold,
        )
    }

    /**
     * Reading session card. The cover is served as a link to our backend by session id rather
     * than a path inside the shelf: that path came from someone else's database, and there is no
     * reason to expose it ([ReadingResource]).
     */
    private fun readingBookViewOf(session: ReadingSession, retold: Set<Long>) = ReadingBookView(
        title = session.bookTitle,
        author = session.bookAuthor,
        coverUrl = session.id?.takeIf { session.coverPath != null }?.let { "/api/reading/cover/$it" },
        startedAt = session.startedAt,
        readMinutes = ReadingDayRollup.minutes(session.readSeconds),
        startPercent = session.startPercent,
        endPercent = session.endPercent,
        sessionId = session.id,
        hasSummary = session.id in retold,
    )

    /** MSK weekend (axis dates are already MSK): Saturday and Sunday are neutral for streaks. */
    private fun isWeekend(d: LocalDate): Boolean =
        d.dayOfWeek == java.time.DayOfWeek.SATURDAY || d.dayOfWeek == java.time.DayOfWeek.SUNDAY

    /** The record's sleep phases; `null` when none arrived (null is not 0, §5.4). */
    private fun stagesOf(record: DayRecord): SleepStagesView? {
        val rem = record.sleepRemMinutes
        val deep = record.sleepDeepMinutes
        val light = record.sleepLightMinutes
        val awake = record.sleepAwakeMinutes
        if (rem == null && deep == null && light == null && awake == null) return null
        return SleepStagesView(rem, deep, light, awake)
    }

    private companion object {
        /** The one item with a measurement: minutes in the "Journal" app (§5.6). */
        const val JOURNAL_ITEM_KEY = "journal"

        /** The monster item: its mark is the only carrier of drunk / clean (§5.6). */
        const val MONSTER_ITEM_KEY = "monster"

        /** Derived podcast item: minutes and cards are counted by the player poller (§5.6). */
        const val PODCAST_ITEM_KEY = "podcasts"

        /** Derived reading item: minutes and cards arrive from the reader shelf (§5.16). */
        const val READING_ITEM_KEY = "reading"
    }
}

/**
 * Lazy window of day history for streaks: the walk goes back a day at a time, so the window is
 * read in batches of [PAGE] and grows only while a streak is alive and reaching deeper. One
 * window serves every discipline item and the monster alike. PRD §5.6
 */
private class DayHistory(
    anchor: LocalDate,
    private val genesis: LocalDate,
    private val days: DayRecordRepository,
    private val entries: ChecklistEntryRepository,
) {
    private val records = HashMap<LocalDate, DayRecord>()
    private val counts = HashMap<LocalDate, Map<Long, Int>>()

    // The loaded span is `[loadedLo, anchor]` inclusive; empty until the first [ensure].
    private var loadedLo: LocalDate = anchor.plusDays(1)

    /** Extends the window downwards to cover [date], but never past genesis. */
    private fun ensure(date: LocalDate) {
        val target = maxOf(date, genesis)
        if (!target.isBefore(loadedLo)) return
        val hi = loadedLo.minusDays(1)
        val lo = maxOf(genesis, minOf(target, loadedLo.minusDays(PAGE)))
        days.listByDateRange(lo, hi).forEach { records[it.date] = it }
        entries.listByDateRange(lo, hi).groupBy { it.date }.forEach { (d, es) ->
            counts[d] = es.associate { it.itemId to it.count }
        }
        loadedLo = lo
    }

    fun record(date: LocalDate): DayRecord? {
        ensure(date)
        return records[date]
    }

    fun count(date: LocalDate, itemId: Long): Int {
        ensure(date)
        return counts[date]?.get(itemId) ?: 0
    }

    /**
     * Whether the item has a MARK for the day, unlike [count], which collapses "no mark" and
     * "marked zero" into the same `0`. That difference is what separates "did not drink" from
     * "the shortcut never ran that day" (see `DayView.monsterDrunk`).
     */
    fun hasEntry(date: LocalDate, itemId: Long): Boolean {
        ensure(date)
        return counts[date]?.containsKey(itemId) == true
    }

    private companion object {
        /** Backward read batch size (about a quarter): a run almost always breaks on page one. */
        const val PAGE = 92L
    }
}
