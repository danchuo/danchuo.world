/**
 * Контракт чтения дней — зеркало бэкенд-DTO (`world.danchuo.days.DayView` / `DaySummary`).
 * Держим синхронно с Kotlin-проекциями: соглашение **null ≠ 0** (PRD §5.4) выражено
 * через `number | null` — `null` = «нет данных», `0` = реальный ноль.
 */

import type { WaveLayout } from "@/lib/layout";

export interface SleepStagesView {
  rem: number | null;
  deep: number | null;
  light: number | null;
  awake: number | null;
}

export interface HealthView {
  steps: number | null;
  sleepMinutes: number | null;
  sleepStages: SleepStagesView | null;
}

/**
 * Деталь ночи (`GET /api/sleep/night/{date}`, зеркало `world.danchuo.health.SleepNightView`) —
 * ночь как она была вместо одной суммы. Минуты во всех полях считаются от `axisStartHour`
 * кануна: ночь лежит по обе стороны полуночи, и на оси-сутках она бы рвалась пополам.
 */
export interface SleepBandPartView {
  stage: "light" | "deep" | "rem" | "awake";
  fromMinute: number;
  toMinute: number;
}

export interface SleepBandView {
  /** Лёг (первый кусок ночи, возможно ещё не сон). */
  onsetMinute: number;
  wakeMinute: number;
  /** Сон без пробуждений — то же число, что в `sleepMinutes` дня. */
  asleepMinutes: number;
  /** Уснул (первый кусок настоящего сна). */
  asleepFromMinute: number;
  parts: SleepBandPartView[];
}

export interface SleepNightView {
  date: string;
  axisStartHour: number;
  /** `null` = кусков за эту ночь нет. */
  band: SleepBandView | null;
}

export interface WorkoutView {
  type: string;
  durationMinutes: number;
  activeEnergyKcal: number | null;
  distanceMeters: number | null;
}

export interface DisciplineItemView {
  key: string;
  label: string;
  icon: string | null;
  count: number;
  target: number;
  /**
   * Стрик по каждой остановке пункта (§5.6): индекс `k` = серия дней подряд с `count ≥ k+1`.
   * Длина = `target`. Опционально: старые кэш-ответы/фикстуры без поля читаются как «нет серии».
   */
  occurrenceStreaks?: number[];
  /**
   * Измеренное время по пункту в минутах; `null`/нет — «не мерили», строка не рисуется.
   * Приходит у `journal` (минуты в приложении «Журнал», §5.6) и у `podcasts` (минуты,
   * насчитанные поллером плеера) — карта не знает ключей: показывает цифру там, где
   * измерение есть.
   */
  measuredMinutes?: number | null;
  /**
   * Что слушали за день (§5.6) — карточки для ховера по остановкам пункта. Приходит только
   * у `podcasts`, и только для заходов, закрывших остановку.
   *
   * Карточка — на ЗАХОД, а не на эпизод: тот же эпизод, взятый по дороге туда и обратно,
   * приезжает двумя карточками. Длина всё равно НЕ обязана совпадать с `count`: марафон в один
   * присест закрывает обе остановки одним заходом и даёт одну карточку — карта раздаёт карточки
   * по порядку, лишняя остановка остаётся без ховера.
   */
  episodes?: PodcastEpisodeView[];
  /**
   * Что читали за день (§5.16) — карточки для ховера по остановкам пункта `reading`. Пусто у
   * остальных пунктов и у самого чтения, пока ни одна сессия не закрыла остановку.
   */
  books?: ReadingBookView[];
}

/**
 * Карточка сессии чтения (§5.16): обложка, книга и автор, когда и сколько читали, и пройденный
 * кусок книги.
 *
 * Проценты приезжают долей 0..1, как их хранит читалка, и оба конца необязательны — пустота у
 * них РАЗНАЯ по смыслу. Пустой `startPercent` — книга приехала к нам уже начатой (истории до
 * себя мы не придумываем); пустые оба вместе с `startedAt` — импортированный прошлый день, где
 * известны одни минуты.
 */
export interface ReadingBookView {
  title: string;
  author: string | null;
  /** Ссылка на обложку с нашего же бэкенда; `null` — у книги её нет. */
  coverUrl: string | null;
  /** ISO-момент начала захода; `null` у импортированного дня. В подпись идёт временем MSK. */
  startedAt: string | null;
  /** Сколько читали В ЭТОТ ЗАХОД, минут; эта же цифра стоит под своей остановкой. */
  readMinutes: number;
  startPercent: number | null;
  endPercent: number | null;
  /** Id захода — ключ к его пересказу (`GET /api/summary/reading/{id}`). */
  sessionId?: number | null;
  /**
   * Есть ли что рассказать про пройденный кусок (§5.16). Сам текст сюда не едет — он нужен
   * только раскрытому окну, а проекция дня возится на каждый день календаря.
   */
  hasSummary?: boolean;
}

/**
 * Пересказ пройденного за заход куска (§5.16.1): пункты и строка-итог. Один и тот же для книги
 * и для выпуска — вопрос «что там было» от предмета не зависит.
 *
 * Собран **по тексту самого источника** — для книги это epub, который читалка синкает вместе со
 * статистикой, и бэкенд вырезает из него ровно тот кусок, что стоит на карточке («48% → 53%»).
 * Пересказа «по памяти модели» здесь не бывает: нет источника — нет и кнопки.
 */
export interface SummaryView {
  bullets: string[];
  /** Одна фраза про весь кусок; `null` — модель её не дала, и это не повод терять пункты. */
  takeaway: string | null;
}

/** Карточка прослушанного захода (§5.6): обложка, эпизод и шоу со ссылками, когда и сколько. */
export interface PodcastEpisodeView {
  episodeName: string;
  episodeUrl: string | null;
  /** Название шоу — «автор» карточки: издателя Spotify в плеере не отдаёт. */
  showName: string;
  showUrl: string | null;
  imageUrl: string | null;
  /**
   * Времени начала захода тут НЕТ: «во сколько включил» — не тот вопрос,
   * который задаёт карточка. На бэкенде оно продолжает храниться (по нему заходы упорядочены
   * и склеены), просто наружу не едет.
   */
  /** Сколько слушали В ЭТОТ ЗАХОД, минут; эта же цифра стоит под своей остановкой. */
  listenedMinutes: number;
  /**
   * Какой КУСОК выпуска пройден за этот заход, в минутах от его начала: «45 → 95». Отвечает не
   * «сколько», а «что именно», и потому же, что проценты у книги, стоит и на карточке, и в окне
   * пересказа. Пусто — начала окна у захода нет; тогда куска не показываем вовсе.
   */
  startMinute?: number | null;
  endMinute?: number | null;
  /** Полная длительность эпизода, минут; `null` — не приехала. */
  durationMinutes?: number | null;
  /**
   * Id захода — ключ к его пересказу (`GET /api/summary/podcast/{id}`, §5.16.1). Это id первой
   * из склеенных сессий: собственного ключа у захода нет, он собирается на чтении.
   */
  sessionId?: number | null;
  /**
   * Есть ли что рассказать про прослушанный кусок (§5.16.1). Сам текст сюда не едет — он нужен
   * только раскрытому окну, а проекция дня возится на каждый день календаря.
   */
  hasSummary?: boolean;
}

/** Полная проекция дня (`GET /api/days/{date}`) — плитка «Сегодня» / перефокус. */
export interface DayView {
  date: string;
  title: string | null;
  hasData: boolean;
  health: HealthView;
  workouts: WorkoutView[];
  discipline: DisciplineItemView[];
  /**
   * Пил ли монстра в этот день (§5.6). Три состояния: `null` = за день монстра не отмечали,
   * `true` = пил, `false` = не пил. Без третьего «не отмечали» выдавалось бы за честное «не
   * пил»: по `hasData` их не различить — запись дня создаёт health-ingest (авто 12/18/24 MSK),
   * а монстра пишет другой, интерактивный шорткат.
   *
   * Опционально: ответы старого кэша поля не несут. Отсутствие читаем как «не отмечали» —
   * молчать безопаснее, чем утверждать чистый день, которого могло не быть.
   */
  monsterDrunk?: boolean | null;
  /**
   * Стрик «чистоты» монстра (§5.6): дней подряд без монстра, отсчёт «по вчера».
   * Опционально: старые кэш-ответы/фикстуры без поля читаются как «нет серии».
   */
  monsterCleanStreak?: number;
}

// ── Spotify (PRD §M3) — зеркало `world.danchuo.spotify.SpotifyViews`. ──

/** Исполнитель со ссылкой-атрибуцией на его страницу в Spotify. */
export interface ArtistRef {
  name: string;
  url: string | null;
}

/** Альбом со ссылкой-атрибуцией на его страницу в Spotify. */
export interface AlbumRef {
  name: string;
  url: string | null;
}

/** Один трек в человекочитаемом виде; `url` — ссылка-атрибуция на Spotify. */
export interface TrackView {
  title: string;
  artists: ArtistRef[];
  /** `null` для синглов/одноимённых релизов — альбом не показываем. */
  album: AlbumRef | null;
  albumImageUrl: string | null;
  url: string | null;
  durationMs: number | null;
}

/** Источник воспроизведения: плейлист/артист/подкаст/«любимое». `null` для альбома и «вне контекста». */
export interface SourceRef {
  /** Тип контекста Spotify: `playlist` | `artist` | `collection` | `show`. */
  type: string;
  url: string;
  /** Имя источника (плейлиста/артиста); `null`, если не добралось — показываем тип. */
  name: string | null;
}

/** «Сейчас играет»: `track === null` ⇒ ничего не играет / не подключено. */
export interface NowPlayingView {
  isPlaying: boolean;
  progressMs: number | null;
  track: TrackView | null;
  source: SourceRef | null;
}

/** Недавно сыгранный трек с ISO-меткой времени проигрывания. */
export interface RecentTrackView {
  track: TrackView;
  playedAt: string | null;
}

// ── Контент M4 (PRD §5.7/§5.8/§5.9/§5.12) — зеркало Kotlin-DTO соответствующих слайсов. ──

/** Проект (`GET /api/projects`); диапазон («Q3 2025 — наст.») форматирует фронт из сырых полей. */
export interface ProjectView {
  iconUrl: string | null;
  /** Объёмная планета (`.glb`), если она у проекта есть; надеть её решает волна (DESIGN §12.5). */
  modelUrl: string | null;
  title: string;
  description: string | null;
  startYear: number;
  startQuarter: number | null;
  endYear: number | null;
  endQuarter: number | null;
  /** Ссылка, которую блок показывает строкой (путь репозитория/сайта). */
  url: string | null;
  /** «Дом» проекта — куда ведут название и картинка; `null` ⇒ туда же, куда [url]. */
  homeUrl: string | null;
}

/** Соцссылка (`GET /api/social-links`): иконка + подпись + гиперссылка. */
export interface SocialLinkView {
  platform: string;
  name: string;
  url: string;
  icon: string | null;
}

/**
 * Последний пост Instagram (`GET /api/instagram/latest`, PRD §5.17). Бэкенд отвечает 204,
 * пока аккаунт не подключён, — клиент превращает это в `null`.
 *
 * ⚠️ `imageUrl` и `avatarUrl` ведут на НАШ бэкенд, а не на CDN Instagram: подписанные ссылки
 * источника живут часами, поэтому байты сняты себе. `likes`/`comments` — `null`, когда
 * владелец спрятал счётчики у поста: это законное состояние, строку просто не рисуем.
 */
export interface InstagramPostView {
  username: string;
  permalink: string;
  caption: string | null;
  /** `IMAGE` · `VIDEO` · `CAROUSEL_ALBUM` — как их называет Instagram. */
  mediaType: string;
  imageUrl: string | null;
  avatarUrl: string | null;
  likes: number | null;
  comments: number | null;
  /** ISO-8601 UTC; «2 дня назад» считает фронт, как у остальных плиток. */
  postedAt: string;
}

/** Артефакт marquee (`GET /api/artifacts`); `firstMentionedOn` — только в ховер-поповере (§5.8). */
export interface ArtifactView {
  name: string;
  /** PNG/GIF артефакта; `null` — артефакт без картинки (рисуем пиксель-плейсхолдер). */
  imageUrl: string | null;
  firstMentionedOn: string;
  /** Можно ли класть предмет набок в ленте, идущей поперёк него (DESIGN §7.2). */
  rotatable?: boolean;
}

/** Волна (`GET /api/theme/active`, `/api/themes`): `tokens` инжектятся в `:root` как `--<ключ>`. */
export interface ThemeView {
  key: string;
  name: string;
  tokens: Record<string, string>;
  /** Layout-блок волны (переопределяет дефолт bento); `null` ⇒ дефолт `layout.ts` (§3, §10). */
  layout: WaveLayout | null;
  active: boolean;
  releasedAt: string;
}

/** Дроп для тизер-тайла (`GET /api/drops`). */
export interface FilmDropView {
  id: number;
  title: string;
  droppedOn: string;
  monthLabel: string | null;
  photoCount: number;
  coverPhotoUrl: string | null;
}

/** Кадр дропа (`GET /api/drops/{id}`); `width/height` — для justified-композиции модалки. */
export interface FilmPhotoView {
  /** web-вариант (для модалки/борда). */
  imageUrl: string;
  /** thumb-вариант (для сетки/превью-тайла). */
  thumbUrl: string;
  width: number | null;
  height: number | null;
  /** Найденные на кадре артефакты — подсветка в модалке (§5.12). Пусто/нет — рамок нет. */
  artifacts?: ArtifactBoxView[];
}

/**
 * Рамка подсветки артефакта на кадре. Координаты — **доли кадра** (0..1), а не пиксели:
 * один и тот же кадр рендерится в разных размерах (мозаика, thumb, модалка), и множитель
 * задаёт уже вёрстка.
 */
export interface ArtifactBoxView {
  artifactId: number;
  name: string;
  /** Картинка предмета из каталога для подсказки у рамки; `null` — предмет без картинки. */
  imageUrl?: string | null;
  /** Можно ли класть предмет набок — карточка у рамки уважает флаг так же, как лента (§7.2). */
  rotatable?: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ── Админ фото-дропов (`/api/ingest/drops*`, за bearer; зеркало Kotlin-DTO film) ──

/** Дроп в админке — управление + текущая обложка. */
export interface AdminDropView {
  id: number;
  title: string;
  droppedOn: string;
  monthLabel: string | null;
  photoCount: number;
  coverPhotoId: number | null;
}

/** Кадр в админ-сетке выбора обложки. */
export interface AdminPhotoView {
  id: number;
  thumbUrl: string;
  /** web-вариант — крупный кадр для ручной разметки артефактов (§5.12); в сетке не нужен. */
  imageUrl: string;
  isCover: boolean;
  /** Что нашлось на кадре (§5.12) — админка даёт снять лишнее. */
  artifacts?: ArtifactBoxView[];
  /** Итог проверки поворота (B9): `none`/`cw90`/`ccw90`/`r180`/`ambiguous`/`manual`; `null` — не проверялся. */
  orientation: string | null;
}

/** Статус LLM-проверки поворота кадров дропа (B9) — поллится, пока `state === "running"`. */
export interface OrientationStatusView {
  /** `idle` (не запускалась) / `running` / `done` / `failed`. */
  state: string;
  total: number;
  checked: number;
  rotated: number;
  /** Пропущено (LLM молчала) — останутся непроверенными до следующего прогона. */
  skipped: number;
}

/** Итог загрузки zip: дроп + сколько кадров обработано/пропущено. */
export interface UploadResultView {
  drop: AdminDropView;
  processed: number;
  skipped: number;
}

/** Свежесть данных (`GET /api/freshness`, PRD §8); `lastIngestAt` `null` = приёмов ещё не было. */
export interface FreshnessView {
  lastIngestAt: string | null;
}

// ── Велобайк (PRD §9 B4) — зеркало Kotlin-DTO слайса bike. Всё публичное чтение. ──

/** Поездка (`GET /api/rides`). Гео — только старт и финиш (трека маршрута нет). */
export interface RideView {
  id: number;
  rideDate: string;
  startTime: string;
  finishTime: string;
  distanceMeters: number;
  durationSeconds: number;
  calories: number | null;
  /**
   * Что натикало **сверх** доступа (копейки): минуты поминутного тарифа либо превышение пакета.
   * Это не полная цена поездки — вход в тариф оплачен отдельно (`accessKopecks`). null — нет данных.
   * Формат — `formatRideCost`.
   */
  costKopecks: number | null;
  /**
   * Цена (копейки) «Доступа», купленного **ради этой поездки**: платный старт поминутного тарифа
   * или пакет минут. Вместе с `costKopecks` даёт `totalKopecks`. null — доступ оплатила другая
   * поездка либо покупки в истории нет.
   */
  accessKopecks: number | null;
  /**
   * Цена (копейки) пакета, под которым едет поездка, **не купившая доступ сама**: показываем
   * «в рамках тарифа за N ₽» / «сверх тарифа». Деньги за пакет уже посчитаны у поездки, которая
   * его купила, — в `totalKopecks` они не входят. null — доступ куплен ею же либо покупки нет.
   */
  coveredByTariffKopecks: number | null;
  /** Сколько поездка стоила на самом деле: `accessKopecks` + `costKopecks`. null — данных нет. */
  totalKopecks: number | null;
  vehicleType: string | null;
  tariffName: string | null;
  startLat: number | null;
  startLon: number | null;
  finishLat: number | null;
  finishLon: number | null;
  startAddress: string | null;
  finishAddress: string | null;
}

/** Итог ручного импорта поездок (`POST /api/ingest/bike/rides`): сколько создано/обновлено. */
export interface BikeImportResultView {
  created: number;
  updated: number;
}

/**
 * Сводка за текущий календарный месяц (`GET /api/rides/month-summary`) — шапка модалки поездок.
 * `spentKopecks` — реально уплаченные за месяц деньги (платные поездки + покупки тарифов-пакетов
 * этого месяца, каждая один раз), поэтому бесплатные поездки «в рамках тарифа» не задваивают сумму.
 * `rides === 0` — в этом месяце поездок нет (строку не рисуем).
 */
export interface RideMonthSummaryView {
  /** Месяц сводки `YYYY-MM` (MSK). */
  month: string;
  rides: number;
  durationSeconds: number;
  spentKopecks: number;
}

/** Агрегат истории поездок (`GET /api/rides/stats`). Нулевой — пока поездок нет. */
export interface RideStatsView {
  totalRides: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCalories: number;
  longestRideMeters: number;
  firstRideDate: string | null;
  lastRideDate: string | null;
}

// ── Хитмапа (`GET /api/ingest/analytics/heatmap`, за bearer; PRD §5.11 B2) ──

/** Потайловый агрегат кликов; `tileId` null — клики мимо плиток. `clicks` уже с cap-вклада. */
export interface HeatmapTileView {
  tileId: string | null;
  clicks: number;
  uniques: number;
}

/** Хитмапа одной страницы за период — клики по тайлам борда. */
export interface HeatmapView {
  path: string;
  from: string;
  to: string;
  totalClicks: number;
  tiles: HeatmapTileView[];
}

/** Лёгкая сводка дня (`GET /api/days?from=&to=`) — ячейка календаря / мини-график. */
export interface DaySummary {
  date: string;
  title: string | null;
  hasData: boolean;
  steps: number | null;
  sleepMinutes: number | null;
  /**
   * Вклады GitHub за день (§5.4): `null` = день не собирали, `0` = собрали, вкладов не было.
   * Чип в статах молчит в обоих случаях, но различие живо в данных — его ждёт линза календаря.
   */
  contributions: number | null;
  /**
   * Счётчик по каждому активному пункту (`ключ` → `count`), включая нули — линза календаря
   * (§5.3): остановка карты закрывается порогом `count ≥ occurrence`, поэтому свёртка
   * «N из M закрыто» линзе не годится, и сводка её больше не несёт вовсе.
   * Опционально: ответы старого кэша поля не несут (читается как «нет ответа»).
   */
  disciplineCounts?: Record<string, number>;
  /**
   * Пил ли монстра за день — те же три состояния, что в [DayView]: `null`/нет = не отмечали,
   * `true` = пил, `false` = не пил. Третье нужно линзе календаря, чтобы день без запуска
   * шортката не попадал в «не пил» наравне с честно чистым.
   */
  monsterDrunk?: boolean | null;
}

/** Артефакт в админке (`/api/ingest/artifacts`) — все поля формы (PRD §5.8). */
export interface AdminArtifactView {
  id: number;
  name: string;
  imageUrl: string | null;
  firstMentionedOn: string;
  rotatable: boolean;
  /** Как предмет выглядит — описание для поиска на кадрах дропов (§5.12). */
  detectionHint: string | null;
}

/**
 * Тело формы заведения/правки артефакта. Места в ленте тут нет: порядок — хроника,
 * его задаёт `firstMentionedOn` (старое первым).
 */
export interface ArtifactInput {
  name: string;
  firstMentionedOn: string;
  rotatable: boolean;
  detectionHint: string | null;
}

/** Статус поиска артефактов по дропу (§5.12) — поллится, пока `state === "running"`. */
export interface ArtifactScanStatusView {
  state: "idle" | "queued" | "running" | "done" | "failed" | "cancelled";
  total: number;
  checked: number;
  found: number;
  skipped: number;
}

/** Сводка по прогону, запущенному разом по всем дропам (§5.12). */
export interface ArtifactScanRunView {
  state: "idle" | "running" | "done" | "failed" | "cancelled";
  total: number;
  checked: number;
  found: number;
  /** Устойчиво большой при нулевых находках — обычно молчит провайдер, а не пусты кадры. */
  skipped: number;
  drops: number;
  dropsDone: number;
  /** Имя предмета, если прогон заведён ради одного; `null` — искали весь каталог. */
  artifactName: string | null;
}
