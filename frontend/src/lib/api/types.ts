/**
 * Контракт чтения дней — зеркало бэкенд-DTO (`world.danchuo.days.DayView` / `DaySummary`).
 * Держим синхронно с Kotlin-проекциями: соглашение **null ≠ 0** (PRD §5.4) выражено
 * через `number | null` — `null` = «нет данных», `0` = реальный ноль.
 */

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

/** «Сейчас играет»: `track === null` ⇒ ничего не играет / не подключено. */
export interface NowPlayingView {
  isPlaying: boolean;
  progressMs: number | null;
  track: TrackView | null;
}

/** Недавно сыгранный трек с ISO-меткой времени проигрывания. */
export interface RecentTrackView {
  track: TrackView;
  playedAt: string | null;
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
