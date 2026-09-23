package world.danchuo.days

import io.quarkus.runtime.annotations.RegisterForReflection
import java.time.LocalDate

/**
 * Light day summary for the calendar and the 15-day mini-chart, served as a list by
 * `GET /api/days?from=&to=`. It carries only what the grid and its hover need, without [DayView]'s
 * heavy parts; empty and future days are included ([hasData] false) so the grid has no holes.
 */

// Response-wrapped views need explicit reflection registration for native-image (else {} in JSON).
@RegisterForReflection
data class DaySummary(
    val date: LocalDate,
    val title: String?,
    val hasData: Boolean,
    val steps: Int?,
    val sleepMinutes: Int?,
    /**
     * GitHub contributions for the day (§5.4) — activity of another kind beside steps. `null`
     * means the day was never collected, `0` that it was and there were none. The stats tile is
     * silent either way, but the calendar lens (§9 I-19) tells them apart.
     */
    val contributions: Int?,
    /**
     * Executions per ACTIVE item (`item key` -> `count`), zeros included: that is what keeps "the
     * item existed but was not done" distinct from "the item did not exist then". Deliberately no
     * "N of M" rollup — the calendar lens closes a stop by `count >= occurrence`. PRD §5.3, §5.6
     */
    val disciplineCounts: Map<String, Int>,
    /**
     * Whether the monster was drunk: the same three states as `DayView.monsterDrunk`. The third
     * is what the calendar lens needs — without it a day whose shortcut never ran would count as
     * clean alongside an honestly clean one.
     */
    val monsterDrunk: Boolean?,
    /** The day's activity keys in catalogue order, for the calendar's activity lens; empty when none. */
    val activities: List<String>,
    /** Whether the day has a photo; the calendar's photo lens needs only that. PRD §5.3 */
    val hasPhoto: Boolean,
)
