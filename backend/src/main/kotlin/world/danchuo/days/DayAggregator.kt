package world.danchuo.days

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import world.danchuo.health.WorkoutRepository
import world.danchuo.monster.MonsterFlavorRepository
import java.time.LocalDate

/**
 * Агрегатор дня (PRD §3.1, §12 M2) — собирает read-проекции [DayView]/[DaySummary] из
 * слайсов `days`/`health`/`checklist`/`monster`. Живёт в `days`: слайс владеет осью дня
 * и эндпоинтом `/api/days`, а соседей читает через их **публичные швы** (репозитории),
 * не лазая в их БД — тот же приём, что у `checklist` в `DailyIngestService`.
 *
 * Только чтение, без транзакций-мутаций. Соглашения (§4/§5.4): дни считаются по дате-ключу
 * MSK; отсутствие записи — это пустой день, а не ошибка (форма ответа не меняется).
 */
@ApplicationScoped
class DayAggregator(
    private val days: DayRecordRepository,
    private val workouts: WorkoutRepository,
    private val checklistItems: ChecklistItemRepository,
    private val checklistEntries: ChecklistEntryRepository,
    private val monsterFlavors: MonsterFlavorRepository,
) {

    /** Полная проекция дня для плитки «Сегодня» / перефокуса; пустой день — валидная проекция. */
    fun viewOf(date: LocalDate): DayView {
        val record = days.findByDate(date)
        val items = checklistItems.listActive()
        val counts = checklistEntries.listByDate(date).associate { it.itemId to it.count }

        val discipline = items.map { item ->
            DisciplineItemView(
                key = item.key,
                label = item.label,
                icon = item.icon,
                count = counts[item.id] ?: 0,
                target = item.target,
            )
        }

        val monster = record?.monsterFlavorId
            ?.let { monsterFlavors.findById(it) }
            ?.let { MonsterView(it.key, it.name, it.imageUrl, it.accentColor) }

        return DayView(
            date = date,
            title = record?.title,
            hasData = record != null,
            health = HealthView(
                steps = record?.steps,
                sleepMinutes = record?.sleepMinutes,
                sleepStages = record?.let(::stagesOf),
            ),
            workouts = workouts.listByDate(date).map {
                WorkoutView(it.type, it.durationMinutes, it.activeEnergyKcal, it.distanceMeters)
            },
            discipline = discipline,
            monster = monster,
        )
    }

    /**
     * Сводки за непрерывный диапазон `[from, to]` для календаря и мини-графика. Дни без
     * записи возвращаются пустыми сводками — сетка календаря рисуется без дыр (§4).
     * Грузим соседей пакетно (записи/отметки/вкусы — по одному запросу), без N+1 по дням.
     */
    fun summaries(from: LocalDate, to: LocalDate): List<DaySummary> {
        val items = checklistItems.listActive()
        val total = items.size
        val records = days.listByDateRange(from, to).associateBy { it.date }
        val entriesByDate = checklistEntries.listByDateRange(from, to).groupBy { it.date }
        val flavorsById = monsterFlavors.listAll().associateBy { it.id }

        return generateSequence(from) { if (it < to) it.plusDays(1) else null }
            .map { date ->
                val record = records[date]
                val counts = entriesByDate[date].orEmpty().associate { it.itemId to it.count }
                val done = items.count { (counts[it.id] ?: 0) >= it.target }
                val monster = record?.monsterFlavorId
                    ?.let { flavorsById[it] }
                    ?.let { MonsterMark(it.key, it.name, it.accentColor) }

                DaySummary(
                    date = date,
                    title = record?.title,
                    hasData = record != null,
                    steps = record?.steps,
                    sleepMinutes = record?.sleepMinutes,
                    disciplineDone = done,
                    disciplineTotal = total,
                    monster = monster,
                )
            }
            .toList()
    }

    /** Фазы сна записи; `null`, если ни одна не пришла (null ≠ 0, §5.4). */
    private fun stagesOf(record: DayRecord): SleepStagesView? {
        val rem = record.sleepRemMinutes
        val deep = record.sleepDeepMinutes
        val light = record.sleepLightMinutes
        val awake = record.sleepAwakeMinutes
        if (rem == null && deep == null && light == null && awake == null) return null
        return SleepStagesView(rem, deep, light, awake)
    }
}
