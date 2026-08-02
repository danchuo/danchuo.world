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
   * Пока приходит только у `journal` (минуты в приложении «Журнал», §5.6) — карта не знает
   * ключей: показывает цифру там, где измерение есть.
   */
  measuredMinutes?: number | null;
}

export interface MonsterView {
  key: string;
  name: string;
  imageUrl: string;
  accentColor: string | null;
}

/** Полная проекция дня (`GET /api/days/{date}`) — плитка «Сегодня» / перефокус. */
export interface DayView {
  date: string;
  title: string | null;
  hasData: boolean;
  health: HealthView;
  workouts: WorkoutView[];
  discipline: DisciplineItemView[];
  monster: MonsterView | null;
  /**
   * Стрик «чистоты» монстра (§5.6): дней подряд без монстра, отсчёт «по вчера».
   * Опционально: старые кэш-ответы/фикстуры без поля читаются как «нет серии».
   */
  monsterCleanStreak?: number;
}

export interface MonsterMark {
  key: string;
  name: string;
  accentColor: string | null;
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
  title: string;
  description: string | null;
  startYear: number;
  startQuarter: number | null;
  endYear: number | null;
  endQuarter: number | null;
  url: string | null;
}

/** Соцссылка (`GET /api/social-links`): иконка + подпись + гиперссылка. */
export interface SocialLinkView {
  platform: string;
  name: string;
  url: string;
  icon: string | null;
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
  /** Стоимость поездки в копейках (null — нет данных). Формат — `formatRideCost`. */
  costKopecks: number | null;
  /**
   * Для бесплатной поездки (`costKopecks === 0`) — цена ближайшего предшествующего купленного
   * тарифа (копейки), «покрывающего» её: показываем «в рамках тарифа за N ₽» вместо «бесплатно».
   * null — поездка платная либо подходящей покупки в истории нет.
   */
  coveredByTariffKopecks: number | null;
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
  disciplineDone: number;
  disciplineTotal: number;
  /**
   * Счётчик по каждому активному пункту (`ключ` → `count`), включая нули — линза календаря
   * (§5.3): остановка карты закрывается порогом `count ≥ occurrence`, а свёртки `disciplineDone`
   * для этого мало. Опционально: ответы старого кэша поля не несут (читается как «нет ответа»).
   */
  disciplineCounts?: Record<string, number>;
  monster: MonsterMark | null;
}

/** Артефакт в админке (`/api/ingest/artifacts`) — все поля формы (PRD §5.8). */
export interface AdminArtifactView {
  id: number;
  name: string;
  imageUrl: string | null;
  firstMentionedOn: string;
  rotatable: boolean;
  sortOrder: number;
  /** Как предмет выглядит — описание для поиска на кадрах дропов (§5.12). */
  detectionHint: string | null;
}

/** Тело формы заведения/правки артефакта. */
export interface ArtifactInput {
  name: string;
  firstMentionedOn: string;
  rotatable: boolean;
  sortOrder: number;
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
