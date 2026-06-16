package world.danchuo.core.config

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import jakarta.inject.Singleton
import java.time.Clock
import java.time.LocalDate

/**
 * Единая точка канонического времени MSK (PRD §4, CLAUDE.md).
 *
 * Слайсы инжектят этот бин (или произведённый [Clock]) вместо `LocalDate.now()` /
 * `Clock.systemDefaultZone()`, чтобы «день» везде считался в каноне, а не в tz сервера.
 * Напоминание по семантике: сон относится ко дню пробуждения; будущие дни — пустые.
 */
@ApplicationScoped
class MskTime(private val time: TimeConfig) {

    /** Канонический [Clock] (пояс из [TimeConfig]) — для инъекции в слайсы и тесты. */
    @Produces
    @Singleton
    fun clock(): Clock = Clock.system(time.zoneId())

    /** Сегодняшний день в каноне MSK. */
    fun today(): LocalDate = LocalDate.now(time.zoneId())

    /** Генезис-дата: раньше неё данных нет. */
    val genesis: LocalDate get() = time.genesis()
}
