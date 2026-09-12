package world.danchuo.days

import io.quarkus.cache.CacheInvalidateAll
import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.config.MskTime
import java.time.Clock
import java.time.Instant
import java.time.LocalDate

/**
 * Единая точка записи в [DayRecord] (PRD §3.1, §4). Слайсы (`health`, `checklist`)
 * не трогают день напрямую — пишут через узкие методы здесь, а сервис держит
 * сквозные инварианты: генезис-гард, find-or-create по дате, отметки `created/updatedAt`.
 *
 * Идемпотентность ingest (PRD §12 M1, exit): запись адресуется датой-ключом, повтор
 * за ту же дату обновляет ту же строку (upsert), а не плодит дубли.
 */
@ApplicationScoped
class DayRecordService(
    private val repo: DayRecordRepository,
    private val mskTime: MskTime,
    private val clock: Clock,
    private val ingestStatus: IngestStatusService,
) {

    /**
     * Применить статы здоровья дня (PRD §5.4). `null` пишется как «нет данных», 0 — как ноль.
     * Сбрасывает кэш проекции дня (`day-view`): любой приём может сдвинуть стрики (§5.6).
     *
     * [overwriteSleep] `false` — оставить сон как есть. Пустой прогон Health (заблокированный
     * телефон, окно поиска мимо) неотличим по данным от «не спал», и раньше он **затирал**
     * уже записанную ночь. Право стереть сон осталось только у явного `sleepMinutes = 0`.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyHealth(
        date: LocalDate,
        steps: Int?,
        sleepMinutes: Int?,
        sleepRem: Int?,
        sleepDeep: Int?,
        sleepLight: Int?,
        sleepAwake: Int?,
        overwriteSleep: Boolean = true,
    ): DayRecord = upsert(date) { day ->
        day.steps = steps
        if (overwriteSleep) {
            day.sleepMinutes = sleepMinutes
            day.sleepRemMinutes = sleepRem
            day.sleepDeepMinutes = sleepDeep
            day.sleepLightMinutes = sleepLight
            day.sleepAwakeMinutes = sleepAwake
        }
    }

    /**
     * Сбросить проекцию дня, когда её изменил СОСЕДНИЙ слайс, минуя запись дня (PRD §5.6).
     *
     * Нужен поллеру подкастов: он пишет свои сессии и отметку пункта, `day_record` при этом не
     * трогает, а `DayView` от них зависит — без сброса плитка показывала бы вчерашние минуты.
     * Зовётся не на каждый опрос, а только когда минуты реально прибавились: инвалидация стоит
     * соседнему читателю скана истории под стрики, и дёргать её вхолостую незачем.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun invalidateProjection() = Unit

    /**
     * Записать измеренные минуты дневника за день (PRD §5.6).
     *
     * Отдельный метод, а не поле в [applyHealth], потому что адресуется **другим** днём:
     * минуты принадлежат вечерней корзине, и один прогон Health закрывает несколько дней
     * сразу. Зовётся только для дней, где куски реально нашлись — пустой прогон измеренное
     * не стирает (та же защита, что у сна).
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyJournalMinutes(date: LocalDate, minutes: Int): DayRecord = upsert(date) { day ->
        day.journalMinutes = minutes
    }

    /**
     * Записать вклады GitHub за день (PRD §5.4). Зовётся фоновым сборщиком слайса `github`.
     *
     * [markFresh] = `false` намеренно: индикатор свежести (§8) отвечает на вопрос «когда с
     * телефона в последний раз приезжали данные», а сборщик, который сам ходит наружу каждые
     * полчаса, держал бы лампу вечно на «только что» и обессмыслил бы её.
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyContributions(date: LocalDate, contributions: Int): DayRecord =
        upsert(date, markFresh = false) { day ->
            day.contributions = contributions
        }

    /**
     * Применить ручную мету дня (PRD §5.6): имя дня.
     * Сбрасывает кэш проекции дня (`day-view`): `ingest/daily` всегда проходит здесь, поэтому
     * инвалидация покрывает и запись отметок дисциплины того же запроса (стрики пересчитаются).
     */
    @CacheInvalidateAll(cacheName = "day-view")
    fun applyDailyMeta(date: LocalDate, title: String?): DayRecord = upsert(date) { day ->
        day.title = title?.takeIf { it.isNotBlank() }
    }

    /**
     * Find-or-create за дату с генезис-гардом, применяет [mutate], бьёт `updatedAt`.
     * Внутренний шов: каждый публичный метод выражается через него — инварианты в одном месте.
     *
     * [markFresh] — двигать ли отметку свежести. `true` для каналов приёма с телефона (её
     * они и показывают), `false` для фоновых сборщиков, ходящих наружу по расписанию.
     */
    private inline fun upsert(
        date: LocalDate,
        markFresh: Boolean = true,
        mutate: (DayRecord) -> Unit,
    ): DayRecord {
        if (date.isBefore(mskTime.genesis)) {
            throw DateBeforeGenesisException(date, mskTime.genesis)
        }
        val now = Instant.now(clock)
        val day = repo.findByDate(date) ?: DayRecord().apply {
            this.date = date
            createdAt = now
            updatedAt = now
            repo.persist(this)
        }
        mutate(day)
        day.updatedAt = now
        // Свежесть данных (PRD §8): успешный ПРИЁМ двигает singleton-отметку. Здесь,
        // в единой точке записи, — значит оба канала (health/дисциплина) учтены без дублей.
        if (markFresh) ingestStatus.markIngest(now)
        return day
    }
}
