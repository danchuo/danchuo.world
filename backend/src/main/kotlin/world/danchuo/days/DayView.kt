package world.danchuo.days

import io.quarkus.runtime.annotations.RegisterForReflection
import java.time.Instant
import java.time.LocalDate

/**
 * Public read-projection of one day, assembled from slices by [DayAggregator] — not an entity.
 * Health stats are nullable because `null` ("no data") must not read as a real `0`. An absent
 * or future day answers in the same shape, so the board needs no special branch. PRD §5.2/§5.4
 */

// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).
@RegisterForReflection
data class DayView(
    val date: LocalDate,
    val title: String?,
    /** Whether the day exists in the DB, for the per-tile empty/loaded state. */
    val hasData: Boolean,
    val health: HealthView,
    val workouts: List<WorkoutView>,
    /** Discipline progress as fractions (§5.6): one entry per active item. */
    val discipline: List<DisciplineItemView>,
    /**
     * Three states, not two: `null` means the monster was never marked that day. It cannot be
     * derived from [hasData] — health-ingest creates the day row on its own schedule, so the row
     * is almost always there while the monster comes from a different shortcut. PRD §5.6
     */
    val monsterDrunk: Boolean?,
    /**
     * Clean-streak: consecutive days NOT drunk, counted through yesterday — today joins only
     * once its record is picked (see [StreakCalculator]). PRD §5.6
     */
    val monsterCleanStreak: Int,
)

/** Apple Health stats of the day (§5.4). All nullable — null is not 0. */
@RegisterForReflection
data class HealthView(
    val steps: Int?,
    /** Sleep belongs to the day of waking up (§4). */
    val sleepMinutes: Int?,
    val sleepStages: SleepStagesView?,
)

@RegisterForReflection
data class SleepStagesView(
    val rem: Int?,
    val deep: Int?,
    val light: Int?,
    val awake: Int?,
)

@RegisterForReflection
data class WorkoutView(
    val type: String,
    val durationMinutes: Int,
    val activeEnergyKcal: Int?,
    val distanceMeters: Int?,
)

/**
 * A discipline item with its progress for the day, rendered as "[count]/[target]". The list is
 * data-driven off the active DB items, so no key is hardcoded. `monster` rides here too, by the
 * same mark that tracks it; its verdict is [DayView.monsterDrunk]. PRD §5.6
 */
@RegisterForReflection
data class DisciplineItemView(
    val key: String,
    val label: String,
    val icon: String?,
    val count: Int,
    val target: Int,
    /**
     * Per-stop streaks: index `k` is the run of days with `count >= k+1`, counted through
     * yesterday ([StreakCalculator]). Length equals [target], so entry `[1]` is never above
     * `[0]`. The board indexes it by stop number. PRD §5.6
     */
    val occurrenceStreaks: List<Int>,
    /**
     * Measured minutes for this item; `null` means "not measured", which is the case for most
     * items always. It lives on the item rather than on the day so the board can print the
     * number AT its own stop without knowing any keys. PRD §5.6
     */
    val measuredMinutes: Int?,
    /**
     * Hover cards for the stops of `podcasts`; empty for every other item. One card per SESSION,
     * not per episode, so the length need not match [count]: a single long sitting closes both
     * stops with one card and the spare stop simply gets no hover. PRD §5.6
     */
    val episodes: List<PodcastEpisodeView>,
    /**
     * Hover cards for the stops of `reading`; empty for every other item. Handed out by the same
     * rule as [episodes], including the spare stop left without a hover. PRD §5.13
     */
    val books: List<ReadingBookView>,
)

/**
 * A reading session card for the stop hover (§5.16). Percentages are the 0..1 fractions the
 * reader stores; rounding is the board's job. The two ends are empty for different reasons:
 * [startPercent] when the book arrived already started, [startedAt] when the day was imported.
 */
@RegisterForReflection
data class ReadingBookView(
    val title: String,
    val author: String?,
    /** Cover served by our own backend; `null` when the book has none. */
    val coverUrl: String?,
    /** When the session began; `null` on an imported day. The board converts to MSK. */
    val startedAt: Instant?,
    /** Minutes read IN THIS SESSION; the same number sits under its stop. */
    val readMinutes: Int,
    val startPercent: Double?,
    val endPercent: Double?,
    /**
     * Session id, the key to its summary and cover. `null` only for a card invented in tests:
     * a stored session always has one.
     */
    val sessionId: Long?,
    /**
     * Whether this stretch of the book has a summary (§5.16). The text itself stays out — only
     * the opened modal needs it, while this projection is hauled for every calendar day.
     */
    val hasSummary: Boolean = false,
)

/**
 * A listened-session card for the stop hover (§5.6). [showName] stands in as the card's author:
 * the real publisher would cost a separate catalogue request (rejected — the show is enough).
 * Rejected too: session start time, and the episode's per-day minutes. PRD §5.6
 */
@RegisterForReflection
data class PodcastEpisodeView(
    val episodeName: String,
    val episodeUrl: String?,
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    /** Minutes listened IN THIS SESSION; the same number sits under its stop. */
    val listenedMinutes: Int,
    /**
     * WHICH stretch of the episode this session covered, in minutes from its start ("45 -> 95").
     * `null` when the row predates us watching the window — then no stretch is shown at all,
     * rather than a substituted zero.
     */
    val startMinute: Int?,
    val endMinute: Int?,
    /** Full episode length in minutes; `null` when it never arrived. */
    val durationMinutes: Int?,
    /**
     * Session id, the key to its summary (§5.16.1). It is the id of the FIRST glued session:
     * a sitting has no key of its own, it is assembled on read.
     */
    val sessionId: Long? = null,
    /**
     * Whether this stretch has a summary (§5.16.1). The text stays out — only the opened modal
     * needs it, while this projection is hauled for every calendar day.
     */
    val hasSummary: Boolean = false,
    /** When the sitting began; a book carries the same, so the day's sittings can be ordered. */
    val startedAt: Instant? = null,
)
