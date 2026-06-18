package world.danchuo.days

import java.time.LocalDate

/**
 * Лёгкая сводка дня для **календаря** и **мини-графика 15 дней** (PRD §5.4/§5.6, §12 M2).
 * Отдаётся списком из `GET /api/days?from=&to=`.
 *
 * Несёт ровно то, что нужно сетке календаря и ховер-превью, без тяжёлых частей полного
 * [DayView] (фазы сна, тренировки, поэлементная дисциплина):
 * - [steps]/[sleepMinutes] — ряды мини-графика (§5.4); null ≠ 0.
 * - [title] — маркер имени дня + ховер-превью (§5.6).
 * - [monster] — акцент-цвет пиксель-метки дня в ячейке (DESIGN §6).
 * - [disciplineDone]/[disciplineTotal] — свёртка «N из M пунктов закрыто» для превью.
 *
 * Пустые/будущие дни диапазона тоже попадают в ответ ([hasData] = `false`) — календарь
 * рисует непрерывную сетку без дыр (§4: будущие дни пустые).
 */
data class DaySummary(
    val date: LocalDate,
    val title: String?,
    val hasData: Boolean,
    val steps: Int?,
    val sleepMinutes: Int?,
    /** Сколько активных пунктов дисциплины закрыто (count ≥ target). */
    val disciplineDone: Int,
    /** Всего активных пунктов дисциплины. */
    val disciplineTotal: Int,
    val monster: MonsterMark?,
)

/** Метка монстра для ячейки календаря: имя для превью + акцент для пиксель-метки. */
data class MonsterMark(
    val key: String,
    val name: String,
    val accentColor: String?,
)
