package world.danchuo.health

import io.quarkus.runtime.annotations.RegisterForReflection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Ночь как она была (PRD §5.4, реестр I-23).
 *
 * Сумма минут отвечает «сколько спал», полоса — «как»: во сколько лёг, где провалился,
 * в какие минуты не спал. Данные для этого приходили с первого дня (ingest шлёт сырые куски),
 * но до сих пор схлопывались в четыре числа и терялись — теперь куски доживают до отдачи.
 */
object SleepNight {

    /**
     * Ночь дня пробуждения: самая длинная сессия этого дня, разложенная во времени.
     *
     * Сессий у дня может быть несколько (дневной сон — тоже сессия, закончившаяся сегодня),
     * и в сумму минут они входят все. В полосу — нет: дневные сорок минут растянули бы ось
     * до вечера и сплющили саму ночь. Берётся сессия с наибольшим временем сна.
     */
    fun of(segments: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): List<SleepSegment> =
        SleepSessionizer.sessionsEndingOn(segments, wakeDate, zone)
            .map { SleepSessionizer.flatten(it) }
            .maxByOrNull { asleepSeconds(it) }
            .orEmpty()

    /** Секунды сна (без пробуждений — как считает Apple «Time Asleep», §7). */
    internal fun asleepSeconds(parts: List<SleepSegment>): Long = parts
        .filter { it.stage != SleepStage.AWAKE }
        .sumOf { Duration.between(it.start, it.end).seconds }
}

/**
 * Ось полосы ночи: минуты от **18:00 MSK кануна** дня пробуждения.
 *
 * Почему не от полуночи: ночь лежит по обе стороны от неё, и на оси-сутках вечернее начало
 * уехало бы в конец шкалы, разорвав полосу надвое. Вечерний ноль оси держит любую нормальную
 * ночь одним куском слева направо, а клиенту достаточно арифметики, чтобы подписать часы.
 */
object SleepBand {

    /** Час MSK, с которого начинается ось (и он же — ноль координат полосы). */
    const val AXIS_START_HOUR = 18

    /** Длина оси в минутах: ровно сутки от [AXIS_START_HOUR] до него же. */
    const val AXIS_MINUTES = 24 * 60

    fun of(night: List<SleepSegment>, wakeDate: LocalDate, zone: ZoneId): SleepBandView? {
        if (night.isEmpty()) return null
        val origin = origin(wakeDate, zone)
        val parts = night.map {
            SleepBandPartView(
                // Неразмеченный сон телефона — не пятая фаза, а тот же light: так его считает
                // и сумма дня (§7). Клиенту знать про `unspecified` незачем.
                stage = (if (it.stage == SleepStage.UNSPECIFIED) SleepStage.LIGHT else it.stage).name.lowercase(),
                fromMinute = minuteOf(origin, it.start),
                toMinute = minuteOf(origin, it.end),
            )
        }
        val asleep = night.filter { it.stage != SleepStage.AWAKE }
        return SleepBandView(
            onsetMinute = parts.first().fromMinute,
            wakeMinute = parts.last().toMinute,
            asleepMinutes = Math.round(SleepNight.asleepSeconds(night) / 60.0).toInt(),
            // Сон мог начаться пробуждением (лёг, поворочался): полоса начинается там, где легли,
            // а «уснул» — там, где пошёл первый сон. Пусто быть не может: ночь без сна сюда не едет.
            asleepFromMinute = asleep.firstOrNull()?.let { minuteOf(origin, it.start) } ?: parts.first().fromMinute,
            parts = parts,
        )
    }

    /** Ноль оси: 18:00 кануна в канонической зоне (§4). */
    fun origin(wakeDate: LocalDate, zone: ZoneId): Instant =
        wakeDate.minusDays(1).atTime(AXIS_START_HOUR, 0).atZone(zone).toInstant()

    /**
     * Момент времени в минуту оси. Выход за сутки прижимается к краю, а не заворачивается:
     * заснувший до 18:00 должен начать полосу с нуля, а не оказаться в завтрашнем вечере.
     */
    fun minuteOf(origin: Instant, at: Instant): Int =
        Duration.between(origin, at).toMinutes().coerceIn(0L, AXIS_MINUTES.toLong()).toInt()
}

// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).

/** Полоса одной ночи на оси [SleepBand]. */
@RegisterForReflection
data class SleepBandView(
    /** Минута оси, с которой началась ночь (первый кусок — сон или «лёг и ворочался»). */
    val onsetMinute: Int,
    /** Минута оси, на которой ночь кончилась. */
    val wakeMinute: Int,
    /** Сон в минутах без пробуждений — то же число, что и в сумме дня. */
    val asleepMinutes: Int,
    /** Минута, с которой пошёл первый настоящий сон. */
    val asleepFromMinute: Int,
    val parts: List<SleepBandPartView>,
)

/** Кусок полосы: фаза строкой в нижнем регистре (`light`/`deep`/`rem`/`awake`/`unspecified`). */
@RegisterForReflection
data class SleepBandPartView(val stage: String, val fromMinute: Int, val toMinute: Int)
