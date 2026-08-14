package world.danchuo.days

import io.quarkus.runtime.annotations.RegisterForReflection
import java.time.Instant
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
// Views cross REST only inside Response entities - invisible to native-image static analysis,
// so Jackson needs an explicit reflection registration (otherwise native serializes them as {}).
@RegisterForReflection
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
    /** Монстр дня (§5.6); `null` = «не пил» ЛИБО «не отмечали» — различает [monsterReported]. */
    val monster: MonsterView?,
    /**
     * Отмечали ли монстра за этот день (§5.6). Без этого флага `monster == null` двусмысленно:
     * так выглядит и честное «не пил», и день, за который интерактивный шорткат просто не
     * запускали. Различить по [hasData] нельзя — запись дня создаёт **health-ingest** (авто
     * 12/18/24 MSK), так что она есть почти всегда, а дисциплину и вкус пишет другой шорткат.
     *
     * Признак — наличие отметки пункта `monster` в `checklist_entry`: `ingest/daily` пишет её
     * ВСЕГДА (1 при выбранном вкусе, 0 при «не пил»), поэтому сам факт строки и означает
     * «шорткат за этот день отработал». Отдельная колонка не нужна — данные уже есть.
     */
    val monsterReported: Boolean,
    /**
     * Стрик «чистоты» монстра (§5.6): сколько дней подряд НЕ пил, отсчёт «по вчера»
     * (сегодня в серию не входит, пока запись за него не выбрана — см. [StreakCalculator]).
     */
    val monsterCleanStreak: Int,
)

/** Статы Apple Health дня (§5.4). Все nullable — null ≠ 0. */
@RegisterForReflection
data class HealthView(
    val steps: Int?,
    /** Сон относится ко дню пробуждения (§4). */
    val sleepMinutes: Int?,
    /** Фазы сна; `null`, если ни одна не пришла. */
    val sleepStages: SleepStagesView?,
)

@RegisterForReflection
data class SleepStagesView(
    val rem: Int?,
    val deep: Int?,
    val light: Int?,
    val awake: Int?,
)

@RegisterForReflection
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
@RegisterForReflection
data class DisciplineItemView(
    val key: String,
    val label: String,
    val icon: String?,
    val count: Int,
    val target: Int,
    /**
     * Стрик по каждой остановке пункта (§5.6): индекс `k` = серия дней подряд с `count ≥ k+1`,
     * отсчёт «по вчера» ([StreakCalculator]). Длина = [target]; для `target=2` (подкасты/чтение)
     * `[0]` — дней с ≥1, `[1]` — дней с ≥2 (второе ≤ первого). Фронт берёт по номеру остановки.
     */
    val occurrenceStreaks: List<Int>,
    /**
     * Измеренное время по пункту в минутах; `null` = «не мерили» (у большинства пунктов всегда).
     * Заполняется у `journal` (минуты в приложении «Журнал», §5.6) и у `podcasts` (минуты,
     * насчитанные поллером плеера). Поле живёт здесь, а не отдельным полем дня, чтобы фронт
     * рисовал цифру **у своего пункта** не зная ключей: есть измерение — показывается, нет — нет.
     */
    val measuredMinutes: Int?,
    /**
     * Что именно слушали за день (§5.6) — карточки для ховера по остановкам пункта. Пусто у всех
     * пунктов, кроме `podcasts`, и у него же пусто, пока ни один заход не закрыл остановку.
     *
     * Карточка — на ЗАХОД, а не на эпизод: один эпизод, взятый по дороге туда и обратно, приезжает
     * двумя карточками, потому что заходов было два. Длина всё равно НЕ обязана совпадать с
     * [count]: марафон в один присест закрывает обе остановки одним заходом и даёт одну карточку —
     * это норма, фронт раздаёт карточки по порядку и оставляет лишнюю остановку без ховера.
     */
    val episodes: List<PodcastEpisodeView>,
    /**
     * Что именно читали за день (§5.13) — карточки для ховера по остановкам пункта. Пусто у всех
     * пунктов, кроме `reading`, и у него же пусто, пока ни одна сессия не закрыла остановку.
     *
     * Раздаются по тому же правилу, что и [episodes], и с той же оговоркой: час в присест
     * закрывает обе остановки одной карточкой, и вторая остаётся без ховера — это норма.
     */
    val books: List<ReadingBookView>,
)

/**
 * Карточка сессии чтения (§5.16) — то, что показывается при наведении на остановку пункта
 * «Чтение»: обложка, книга и автор, когда и сколько читали, и путь по процентам.
 *
 * Проценты — доля 0..1, как их хранит читалка; округление до целых — дело борда. Оба конца
 * необязательны, и пустота у них РАЗНАЯ по смыслу: [startPercent] пуст, когда книга приехала
 * к нам уже начатой (историю до себя мы не придумываем), а у импортированных прошлых дней
 * пусто всё, включая [startedAt] — тогда нас там не было.
 */
@RegisterForReflection
data class ReadingBookView(
    val title: String,
    val author: String?,
    /** Ссылка на обложку с нашего же бэкенда; `null` — у книги её нет. */
    val coverUrl: String?,
    /** Когда начался заход; `null` у импортированного дня. Фронт переводит в MSK. */
    val startedAt: Instant?,
    /** Сколько читали В ЭТОТ ЗАХОД, минут; эта же цифра стоит под своей остановкой. */
    val readMinutes: Int,
    val startPercent: Double?,
    val endPercent: Double?,
    /**
     * Id захода — ключ к его пересказу (`GET /api/reading/summary/{id}`) и к обложке. `null`
     * только у выдуманной карточки в тестах: у сохранённой сессии id есть всегда.
     */
    val sessionId: Long?,
    /**
     * Есть ли что рассказать про этот кусок книги (§5.16). Сам текст сюда не едет: он нужен
     * только раскрытому окну, а проекция дня возится на каждый день календаря.
     */
    val hasSummary: Boolean = false,
)

/**
 * Карточка прослушанного захода (§5.6) — то, что показывается при наведении на остановку пункта
 * подкастов: обложка, эпизод и шоу со ссылками, когда и сколько слушали.
 *
 * [showName] — «автор» карточки: настоящего издателя плеер не отдаёт, а ради него пришлось бы
 * ходить в каталог отдельным запросом (рассмотрено и отклонено — владельцу достаточно шоу).
 */
@RegisterForReflection
data class PodcastEpisodeView(
    val episodeName: String,
    val episodeUrl: String?,
    val showName: String,
    val showUrl: String?,
    val imageUrl: String?,
    /** Когда начался этот заход — по нему карточка подписана временем (фронт переводит в MSK). */
    val startedAt: Instant,
    /** Сколько слушали В ЭТОТ ЗАХОД, минут; эта же цифра стоит под своей остановкой. */
    val listenedMinutes: Int,
    /**
     * Сколько прошли по ЭТОМУ ЭПИЗОДУ за все заходы дня, минут. Равно [listenedMinutes], когда
     * заход был один; иначе даёт карточке строку «80 из 85 мин за день» — иначе, разложив 80
     * минут на два захода, борд потерял бы главное: эпизод почти дослушан.
     */
    val dayMinutes: Int,
    /** Полная длительность эпизода, минут; `null` — не приехала. Для строки «80 из 85». */
    val durationMinutes: Int?,
)

/** Монстр дня для плитки «Сегодня»: банка + акцент (DESIGN §6). */
@RegisterForReflection
data class MonsterView(
    val key: String,
    val name: String,
    val imageUrl: String,
    val accentColor: String?,
)
