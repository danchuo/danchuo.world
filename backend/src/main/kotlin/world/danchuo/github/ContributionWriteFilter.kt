package world.danchuo.github

import java.time.LocalDate

/**
 * What of the parsed fragment reaches the database (PRD §5.4). A pure function, so the decision
 * can be tested without a scheduler or a database: the fragment returns a year of cells on every
 * visit, and writing them all every half hour is not an option.
 */
object ContributionWriteFilter {

    /**
     * `parsed` against `stored` (`null` = the day exists but contributions were never collected),
     * giving what to write. Three cuts: before [genesis], after [today] (the current week's tail
     * arrives as zeros), and values that did not change, so `updatedAt` is never bumped in vain.
     */
    fun pending(
        parsed: Map<LocalDate, Int>,
        stored: Map<LocalDate, Int?>,
        genesis: LocalDate,
        today: LocalDate,
    ): Map<LocalDate, Int> = parsed
        .filterKeys { !it.isBefore(genesis) && !it.isAfter(today) }
        .filter { (date, count) -> stored[date] != count }
}
