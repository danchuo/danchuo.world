package world.danchuo.days

import java.time.LocalDate

/**
 * Pure discipline streak logic: the current unbroken run of "done" days, counted back from an
 * anchor day. One function serves both an item's direct streak and the monster's inverse one —
 * only [qualifies] differs. All five rules, and the rejected alternative: PRD §5.6.
 */
object StreakCalculator {

    /**
     * [anchor] is the day being viewed and [today] the real MSK today — they differ whenever a
     * past day is open, and the "today does not drop the run" rule keys off [today]. [isNeutral]
     * makes a day transparent to the run: neither counted nor breaking it. PRD §5.6
     */
    fun streak(
        anchor: LocalDate,
        today: LocalDate,
        genesis: LocalDate,
        isNeutral: (LocalDate) -> Boolean = { false },
        qualifies: (LocalDate) -> Boolean,
    ): Int {
        // The future contributes no run.
        if (anchor.isAfter(today)) return 0

        var day = anchor
        var count = 0
        while (!day.isBefore(genesis)) {
            when {
                // A neutral day (a weekend) is stepped over: neither counted nor breaking.
                isNeutral(day) -> {}
                // An unfilled today does not drop the run: step to yesterday without counting it.
                day == today && !qualifies(day) -> {}
                // The first unfulfilled day (other than an unfilled today) ends the run.
                !qualifies(day) -> return count
                else -> count++
            }
            day = day.minusDays(1)
        }
        return count
    }
}
