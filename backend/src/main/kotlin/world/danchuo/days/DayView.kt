package world.danchuo.days

import java.time.LocalDate

/**
 * Публичная проекция одного дня (PRD §5.2/§5.4/§5.6, §12 M2) — модель плитки «Сегодня»
 * и перефокуса по клику в календаре. Отдаётся из `GET /api/days/{date}`.
 *
 * Это **read-проекция**, не сущность: агрегатор ([DayAggregator]) собирает её из слайсов
 * `days`/`health`/`checklist`/`monster`. Соглашения соблюдаются на выходе:
 * - **null ≠ 0 (§5.4):** статы здоровья nullable — `null` = «нет данных», `0` = реальный ноль.
 * - **Пустые/будущие дни (§4):** дня нет в БД ⇒ [hasData] = `false`, статы `null`,
 *   [discipline] — каркас активных пунктов с прогрессом `0`, [monster] = `null`. Форма
 *   ответа одинакова для наполненного и пустого дня — фронт рисует per-tile empty без спец-ветки.
 */
data class DayView(
    val date: LocalDate,
    /** Имя дня (§5.6); `null` = не задано. */
    val title: String?,
    /** Есть ли запись дня в БД (для per-tile empty/loaded состояния). */
    val hasData: Boolean,
    val health: HealthView,
    val workouts: List<WorkoutView>,
    /** Прогресс дисциплины дробями (§5.6): по одному элементу на активный пункт. */
    val discipline: List<DisciplineItemView>,
    /** Монстр дня (§5.6); `null` = «не пил». */
    val monster: MonsterView?,
)

/** Статы Apple Health дня (§5.4). Все nullable — null ≠ 0. */
data class HealthView(
    val steps: Int?,
    /** Сон относится ко дню пробуждения (§4). */
    val sleepMinutes: Int?,
    /** Фазы сна; `null`, если ни одна не пришла. */
    val sleepStages: SleepStagesView?,
)

data class SleepStagesView(
    val rem: Int?,
    val deep: Int?,
    val light: Int?,
    val awake: Int?,
)

data class WorkoutView(
    val type: String,
    val durationMinutes: Int,
    val activeEnergyKcal: Int?,
    val distanceMeters: Int?,
)

/**
 * Пункт дисциплины с прогрессом за день: фронт рендерит «[count]/[target]».
 * Список data-driven — это верное отражение активных пунктов БД, без хардкода ключей.
 * Пункт `monster` тоже здесь (его прогресс — производная от вкуса, §5.6); визуал банки
 * даёт отдельное поле [DayView.monster].
 */
data class DisciplineItemView(
    val key: String,
    val label: String,
    val icon: String?,
    val count: Int,
    val target: Int,
)

/** Монстр дня для плитки «Сегодня»: банка + акцент (DESIGN §6). */
data class MonsterView(
    val key: String,
    val name: String,
    val imageUrl: String,
    val accentColor: String?,
)
