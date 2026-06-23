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
  vehicleType: string | null;
  tariffName: string | null;
  startLat: number | null;
  startLon: number | null;
  finishLat: number | null;
  finishLon: number | null;
  startAddress: string | null;
  finishAddress: string | null;
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
  disciplineDone: number;
  disciplineTotal: number;
  monster: MonsterMark | null;
}
