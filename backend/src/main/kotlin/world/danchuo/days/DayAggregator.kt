package world.danchuo.days

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import world.danchuo.core.config.MskTime
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
    private val mskTime: MskTime,
) {

    /**
     * Полная проекция дня для плитки «Сегодня» / перефокуса; пустой день — валидная проекция.
     *
     * [today] (сегодня MSK) — отдельный параметр, а не `mskTime.today()` внутри: он входит в
     * КЛЮЧ кэша, поэтому в полночь MSK проекция «сегодня» естественно протухает, а один и тот же
     * день, просмотренный как «сегодня» и назавтра как «прошлый», не путается (правило стрика
     * «по вчера» разное). Кэшируем, чтобы скан истории под стрики (см. [DayHistory]) считался
     * раз на изменение данных; инвалидация — из единой точки записи [DayRecordService].
     */
    @CacheResult(cacheName = "day-view")
    fun viewOf(date: LocalDate, today: LocalDate): DayView {
        val items = checklistItems.listActive()
        // Ленивое окно истории для стриков (читается назад батчами до первого разрыва) —
        // одно на все пункты и монстра дня. Первая страница уже держит записи/отметки самого дня.
        val history = DayHistory(date, mskTime.genesis, days, checklistEntries)
        val record = history.record(date)

        val discipline = items.map { item ->
            val itemId = item.id!!
            // Стрик по КАЖДОЙ остановке пункта: occurrence k (1..target) закрыт днями с count ≥ k.
            val occurrenceStreaks = (1..item.target).map { k ->
                StreakCalculator.streak(date, today, mskTime.genesis) { d -> history.count(d, itemId) >= k }
            }
            DisciplineItemView(
                key = item.key,
                label = item.label,
                icon = item.icon,
                count = history.count(date, itemId),
                target = item.target,
                occurrenceStreaks = occurrenceStreaks,
            )
        }

        val monster = record?.monsterFlavorId
            ?.let { monsterFlavors.findById(it) }
            ?.let { MonsterView(it.key, it.name, it.imageUrl, it.accentColor) }

        // Инверсный стрик «чистоты»: день «чист», если запись за него есть И вкус не выбран
        // (нет записи = «неизвестно» ⇒ разрыв, как и день, когда монстр выпит).
        val monsterCleanStreak = StreakCalculator.streak(date, today, mskTime.genesis) { d ->
            val r = history.record(d)
            r != null && r.monsterFlavorId == null
        }

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
            monsterCleanStreak = monsterCleanStreak,
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

/**
 * Ленивое окно истории дней для стриков (§5.6). Обход серии уходит назад по одному дню; чтобы не
 * ходить в БД построчно и не тянуть сразу всю историю, окно читается **батчами** ([PAGE] дней),
 * расширяясь только когда серия действительно жива и заходит глубже. Одно окно переиспользуется
 * всеми пунктами и монстром дня. Скан целиком гасит кэш проекции — здесь важна лишь дешёвая типовая
 * ветка (короткая серия рвётся в первой странице).
 */
private class DayHistory(
    anchor: LocalDate,
    private val genesis: LocalDate,
    private val days: DayRecordRepository,
    private val entries: ChecklistEntryRepository,
) {
    private val records = HashMap<LocalDate, DayRecord>()
    private val counts = HashMap<LocalDate, Map<Long, Int>>()

    // Загруженная область — `[loadedLo, anchor]` включительно; до первого [ensure] пусто.
    private var loadedLo: LocalDate = anchor.plusDays(1)

    /** Догрузить окно вниз так, чтобы оно накрыло [date] (но не глубже генезиса). */
    private fun ensure(date: LocalDate) {
        val target = maxOf(date, genesis)
        if (!target.isBefore(loadedLo)) return
        val hi = loadedLo.minusDays(1)
        val lo = maxOf(genesis, minOf(target, loadedLo.minusDays(PAGE)))
        days.listByDateRange(lo, hi).forEach { records[it.date] = it }
        entries.listByDateRange(lo, hi).groupBy { it.date }.forEach { (d, es) ->
            counts[d] = es.associate { it.itemId to it.count }
        }
        loadedLo = lo
    }

    fun record(date: LocalDate): DayRecord? {
        ensure(date)
        return records[date]
    }

    fun count(date: LocalDate, itemId: Long): Int {
        ensure(date)
        return counts[date]?.get(itemId) ?: 0
    }

    private companion object {
        /** Размер батча чтения назад (~квартал): почти всегда серия рвётся в первой странице. */
        const val PAGE = 92L
    }
}
