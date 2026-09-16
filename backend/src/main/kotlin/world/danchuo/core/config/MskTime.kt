package world.danchuo.core.config

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import jakarta.inject.Singleton
import java.time.Clock
import java.time.LocalDate

/**
 * The single source of canonical MSK time. Slices inject this bean (or the [Clock] it produces)
 * instead of `LocalDate.now()`, so a "day" is the canon everywhere rather than the server's
 * timezone. Sleep belongs to the day of waking; future days are empty. PRD §4
 */
@ApplicationScoped
class MskTime(private val time: TimeConfig) {

    @Produces
    @Singleton
    fun clock(): Clock = Clock.system(time.zoneId())

    fun today(): LocalDate = LocalDate.now(time.zoneId())

    /** Genesis date: nothing exists before it. */
    val genesis: LocalDate get() = time.genesis()
}
