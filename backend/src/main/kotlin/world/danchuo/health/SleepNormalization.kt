package world.danchuo.health

/** Метрики сна одной ночи, как приходят с ingest'а (длительность + фазы). Все — nullable (§5.4). */
data class SleepInput(
    val minutes: Int?,
    val rem: Int?,
    val deep: Int?,
    val light: Int?,
    val awake: Int?,
)

/**
 * Нормализация сна перед записью (исключение из общего правила `null ≠ 0`, §5.4).
 *
 * У сна нет осмысленного «реального нуля»: ночь в 0 минут означает, что записи сна не было
 * (iOS-шорткат шлёт 0, когда в HealthKit нет сессии за день). В отличие от шагов, где 0 — это
 * честный ноль, 0-минутную ночь схлопываем целиком в «нет данных»: null и длительность, и фазы —
 * рисовать нечего. `null`-сон остаётся `null`; реальная ночь (>0) не трогается, включая 0 в
 * отдельной фазе (это настоящий ноль этой фазы).
 */
object SleepNormalization {

    private val NONE = SleepInput(null, null, null, null, null)

    fun normalize(input: SleepInput): SleepInput =
        if (input.minutes == 0) NONE else input
}
