package world.danchuo.days

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.checklist.ChecklistEntryRepository
import world.danchuo.checklist.ChecklistItemRepository
import world.danchuo.core.config.MskTime
import world.danchuo.health.WorkoutRepository
import world.danchuo.monster.MonsterFlavorRepository
import world.danchuo.reading.ReadingDayRollup
import world.danchuo.reading.ReadingService
import world.danchuo.reading.ReadingSession
import world.danchuo.reading.ReadingSummaryService
import world.danchuo.spotify.PodcastDayRollup
import world.danchuo.spotify.PodcastListenService
import world.danchuo.spotify.PodcastRun
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
    private val podcasts: PodcastListenService,
    private val reading: ReadingService,
    private val readingSummaries: ReadingSummaryService,
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

        // Прослушанное за день читаем ОДИН раз на проекцию: минуты и карточки — свёртки одного
        // и того же набора заходов, а пункт подкастов в списке ровно один.
        val podcastRuns = podcasts.runsOn(date)
        val podcastMinutes = PodcastDayRollup.listenedMinutes(podcastRuns.sumOf { it.listenedMs })
        // Минуты эпизода за весь день — знаменатель строки «80 из 85 мин за день» на карточке.
        val podcastEpisodeMinutes = PodcastDayRollup.episodeMinutes(podcastRuns)

        // Прочитанное за день — так же одним чтением: минуты и карточки суть свёртки одного и
        // того же набора сессий, а пункт чтения в списке ровно один.
        val readingSessions = reading.sessionsOn(date)
        val readingMinutes = ReadingDayRollup.minutes(readingSessions.sumOf { it.readSeconds })
        // Про какие заходы есть что рассказать (§5.16). Спрашиваем ОДНИМ запросом на день: сам
        // текст пересказа сюда не едет — карточке нужен только факт, что кнопке есть что открыть.
        val retoldSessions = readingSummaries.readySessions(readingSessions.mapNotNull { it.id })

        val discipline = items.map { item ->
            val itemId = item.id!!
            // Стрик по КАЖДОЙ остановке пункта: occurrence k (1..target) закрыт днями с count ≥ k.
            // Выходные для дисциплины НЕЙТРАЛЬНЫ (все дела будничные): выходной не считается в серию
            // и не рвёт её — стрик «перешагивает» уик-энд (согласовано с владельцем, §5.6).
            val occurrenceStreaks = (1..item.target).map { k ->
                StreakCalculator.streak(date, today, mskTime.genesis, isNeutral = ::isWeekend) { d ->
                    history.count(d, itemId) >= k
                }
            }
            DisciplineItemView(
                key = item.key,
                label = item.label,
                icon = item.icon,
                count = history.count(date, itemId),
                target = item.target,
                occurrenceStreaks = occurrenceStreaks,
                // Измеряются два пункта: дневник — минутами «Журнала», подкасты — поллером
                // плеера (§5.6). Ключи известны здесь так же, как `monster` известен приёму:
                // производные пункты знают себя по ключу, остальной список остаётся data-driven.
                measuredMinutes = when (item.key) {
                    JOURNAL_ITEM_KEY -> record?.journalMinutes
                    // Ноль минут — это «не слушал», а не измерение: пусть молчит, как остальные.
                    PODCAST_ITEM_KEY -> podcastMinutes.takeIf { it > 0 }
                    // Чтение измеряется так же — минутами с полки читалки (§5.16).
                    READING_ITEM_KEY -> readingMinutes.takeIf { it > 0 }
                    else -> null
                },
                episodes = if (item.key == PODCAST_ITEM_KEY) {
                    PodcastDayRollup.cards(podcastRuns, item.target)
                        .map { episodeViewOf(it, podcastEpisodeMinutes) }
                } else {
                    emptyList()
                },
                books = if (item.key == READING_ITEM_KEY) {
                    ReadingDayRollup.cards(readingSessions, item.target)
                        .map { readingBookViewOf(it, retoldSessions) }
                } else {
                    emptyList()
                },
            )
        }

        val monster = record?.monsterFlavorId
            ?.let { monsterFlavors.findById(it) }
            ?.let { MonsterView(it.key, it.name, it.imageUrl, it.accentColor) }

        // Отмечали ли монстра за день (см. DayView.monsterReported): `ingest/daily` пишет отметку
        // пункта ВСЕГДА — 1 при вкусе, 0 при «не пил», — поэтому наличие строки и есть признак
        // «шорткат отработал». Выбранный вкус засчитываем сам по себе: он без шортката не берётся,
        // и так флаг переживёт возможную деактивацию пункта.
        val monsterItemId = items.firstOrNull { it.key == MONSTER_ITEM_KEY }?.id
        fun reportedOn(d: LocalDate) = history.record(d)?.monsterFlavorId != null ||
            (monsterItemId != null && history.hasEntry(d, monsterItemId))

        val monsterReported = reportedOn(date)

        // Инверсный стрик «чистоты»: день «чист», только если монстра за него ОТМЕЧАЛИ и вкус
        // не выбран. Разделитель — `monsterReported`, а НЕ наличие записи дня: запись создаёт
        // авто-health-ingest (12/18/24 MSK), и по «есть запись, вкуса нет» стрик прибавлял
        // сегодняшний день ещё до того, как шорткат отработал, — то же смешение, что чинил
        // вердикт монстра (§5.6). Неотмеченный день = «неизвестно» ⇒ разрыв, как и выпитый.
        // В ОТЛИЧИЕ от дисциплины монстр считается КАЖДЫЙ день, включая выходные
        // (isNeutral по умолчанию пуст).
        val monsterCleanStreak = StreakCalculator.streak(date, today, mskTime.genesis) { d ->
            reportedOn(d) && history.record(d)?.monsterFlavorId == null
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
            monsterReported = monsterReported,
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
        val monsterItemId = items.firstOrNull { it.key == MONSTER_ITEM_KEY }?.id

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
                    contributions = record?.contributions,
                    disciplineDone = done,
                    disciplineTotal = total,
                    // Ключи — активных пунктов, не только отмеченных: линза должна отличать
                    // «пункт есть, не сделан» от «пункта нет». Тот же набор, что у disciplineTotal.
                    disciplineCounts = items.associate { it.key to (counts[it.id] ?: 0) },
                    monster = monster,
                    // Отметка есть ⇒ шорткат за день отработал; выбранный вкус засчитываем сам
                    // по себе (без шортката он не берётся). `counts` тут — карта только по
                    // РЕАЛЬНЫМ строкам, поэтому containsKey отличает «отмечено нулём» от «нет».
                    monsterReported = monster != null ||
                        (monsterItemId != null && counts.containsKey(monsterItemId)),
                )
            }
            .toList()
    }

    /** Карточка захода: миллисекунды свёртки переводим в минуты уже на выходе. */
    private fun episodeViewOf(run: PodcastRun, episodeMinutes: Map<String, Int>): PodcastEpisodeView {
        val listened = PodcastDayRollup.listenedMinutes(run.listenedMs)
        return PodcastEpisodeView(
            episodeName = run.episodeName,
            episodeUrl = run.episodeUrl,
            showName = run.showName,
            showUrl = run.showUrl,
            imageUrl = run.imageUrl,
            startedAt = run.startedAt,
            listenedMinutes = listened,
            // Карточка всегда собрана из своего захода, поэтому эпизод в карте есть; фолбэк —
            // чтобы «за день» никогда не оказалось меньше, чем уже показано за заход.
            dayMinutes = maxOf(episodeMinutes[run.episodeId] ?: 0, listened),
            durationMinutes = run.episodeDurationMs?.let { PodcastDayRollup.listenedMinutes(it) },
        )
    }

    /**
     * Карточка сессии чтения. Обложка отдаётся ссылкой на наш бэкенд по id сессии, а не путём
     * внутри полки: путь пришёл из чужой базы, и светить его наружу незачем ([ReadingResource]).
     */
    private fun readingBookViewOf(session: ReadingSession, retold: Set<Long>) = ReadingBookView(
        title = session.bookTitle,
        author = session.bookAuthor,
        coverUrl = session.id?.takeIf { session.coverPath != null }?.let { "/api/reading/cover/$it" },
        startedAt = session.startedAt,
        readMinutes = ReadingDayRollup.minutes(session.readSeconds),
        startPercent = session.startPercent,
        endPercent = session.endPercent,
        sessionId = session.id,
        hasSummary = session.id in retold,
    )

    /** Выходной MSK (даты оси уже в MSK): суббота/воскресенье — нейтральны для стрика дисциплины. */
    private fun isWeekend(d: LocalDate): Boolean =
        d.dayOfWeek == java.time.DayOfWeek.SATURDAY || d.dayOfWeek == java.time.DayOfWeek.SUNDAY

    /** Фазы сна записи; `null`, если ни одна не пришла (null ≠ 0, §5.4). */
    private fun stagesOf(record: DayRecord): SleepStagesView? {
        val rem = record.sleepRemMinutes
        val deep = record.sleepDeepMinutes
        val light = record.sleepLightMinutes
        val awake = record.sleepAwakeMinutes
        if (rem == null && deep == null && light == null && awake == null) return null
        return SleepStagesView(rem, deep, light, awake)
    }

    private companion object {
        /** Единственный пункт с измерением: минуты в приложении «Журнал» (§5.6). */
        const val JOURNAL_ITEM_KEY = "journal"

        /** Производный пункт монстра: его отметка — признак «шорткат дня отработал» (§5.6). */
        const val MONSTER_ITEM_KEY = "monster"

        /** Производный пункт подкастов: минуты и карточки считает поллер плеера (§5.6). */
        const val PODCAST_ITEM_KEY = "podcasts"

        /** Производный пункт чтения: минуты и карточки приезжают с полки читалки (§5.16). */
        const val READING_ITEM_KEY = "reading"
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

    /**
     * Есть ли ОТМЕТКА пункта за день — в отличие от [count], которая схлопывает «отметки нет»
     * и «отмечено нулём» в один и тот же `0`. Ровно это различие и отделяет «не пил» от
     * «шорткат за день не запускали» (см. `DayView.monsterReported`).
     */
    fun hasEntry(date: LocalDate, itemId: Long): Boolean {
        ensure(date)
        return counts[date]?.containsKey(itemId) == true
    }

    private companion object {
        /** Размер батча чтения назад (~квартал): почти всегда серия рвётся в первой странице. */
        const val PAGE = 92L
    }
}
