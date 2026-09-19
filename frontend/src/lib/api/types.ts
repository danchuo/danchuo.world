/** Mirrors Kotlin DayView / DaySummary; keep nullable metrics distinct from zero. PRD §5.4. */

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

/** Night offsets start at axisStartHour on the preceding day, so midnight does not split the band. */
export interface SleepBandPartView {
  stage: "light" | "deep" | "rem" | "awake";
  fromMinute: number;
  toMinute: number;
}

export interface SleepBandView {
  /** First night segment, which may precede sleep. */
  onsetMinute: number;
  wakeMinute: number;
  /** Excludes awakenings; equals the day's sleepMinutes. */
  asleepMinutes: number;
  /** First actual sleep segment. */
  asleepFromMinute: number;
  parts: SleepBandPartView[];
}

export interface SleepNightView {
  date: string;
  axisStartHour: number;
  /** null when no segments are available for this night. */
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
  /** Index k counts consecutive days with count >= k+1; length = target. Missing cached values mean no streak. */
  occurrenceStreaks?: number[];
  /** Measured minutes; null or absent means unmeasured. Render by presence, independently of item key. */
  measuredMinutes?: number | null;
  /** One card per qualifying listening visit, not per episode or completed stop. PRD §5.6. */
  episodes?: PodcastEpisodeView[];
  /** Qualifying reading sessions; empty for other items or when no stop is completed. PRD §5.16. */
  books?: ReadingBookView[];
}

/** Percentages are fractions in [0,1]. Missing start means an already-started book; missing both and startedAt means a daily import. */
export interface ReadingBookView {
  title: string;
  author: string | null;
  /** Backend-hosted cover; null when unavailable. */
  coverUrl: string | null;
  /** ISO visit start, displayed in MSK; null for imported daily totals. */
  startedAt: string | null;
  /** Minutes read during this visit. */
  readMinutes: number;
  startPercent: number | null;
  endPercent: number | null;
  /** Summary key: GET /api/summary/reading/{id}. */
  sessionId?: number | null;
  /** Summary availability only; fetch its text when opening the modal. PRD §5.16. */
  hasSummary?: boolean;
}

/** Source-grounded visit summary, shared by reading and podcasts. PRD §5.16.1. */
export interface SummaryView {
  bullets: string[];
  /** Optional overall conclusion; missing it must not discard the bullets. */
  takeaway: string | null;
}

/** Listening visit card. PRD §5.6. */
export interface PodcastEpisodeView {
  episodeName: string;
  episodeUrl: string | null;
  /** Spotify exposes the show name, not its publisher, in the player response. */
  showName: string;
  showUrl: string | null;
  imageUrl: string | null;
  /** Minutes listened during this visit. */
  listenedMinutes: number;
  /** Visited interval in minutes from the episode start; omit the range when unknown. */
  startMinute?: number | null;
  endMinute?: number | null;
  /** Full episode duration in minutes; null when unavailable. */
  durationMinutes?: number | null;
  /** Summary key is the first merged session's id; visits are assembled on read. PRD §5.16.1. */
  sessionId?: number | null;
  /** Summary availability only; fetch its text when opening the modal. */
  hasSummary?: boolean;
  /** ISO start of the visit; a book carries the same, so the day's sittings can be ordered. */
  startedAt?: string | null;
}

/** Full day projection: GET /api/days/{date}. */
export interface DayView {
  date: string;
  title: string | null;
  hasData: boolean;
  health: HealthView;
  workouts: WorkoutView[];
  discipline: DisciplineItemView[];
  /** null or absent = unreported; true = consumed; false = explicitly abstained. hasData cannot distinguish these. PRD §5.6. */
  monsterDrunk?: boolean | null;
  /** Consecutive Monster-free days through yesterday; missing cached values mean no streak. */
  monsterCleanStreak?: number;
}

// Spotify DTOs mirror world.danchuo.spotify.SpotifyViews. PRD §5.5.

/** Artist with a Spotify attribution link. */
export interface ArtistRef {
  name: string;
  url: string | null;
}

/** Album with a Spotify attribution link. */
export interface AlbumRef {
  name: string;
  url: string | null;
}

/** Display track; url provides Spotify attribution. */
export interface TrackView {
  title: string;
  artists: ArtistRef[];
  /** null for singles or same-named releases; hide the album. */
  album: AlbumRef | null;
  albumImageUrl: string | null;
  url: string | null;
  durationMs: number | null;
}

/** Playback source; null for albums or context-free playback. */
export interface SourceRef {
  /** Spotify context type: playlist, artist, collection, or show. */
  type: string;
  url: string;
  /** Fallback to the source type when its name is unavailable. */
  name: string | null;
}

/** track === null means no playback or no connected account. */
export interface NowPlayingView {
  isPlaying: boolean;
  progressMs: number | null;
  track: TrackView | null;
  source: SourceRef | null;
}

/** Recent track with an ISO playback timestamp. */
export interface RecentTrackView {
  track: TrackView;
  playedAt: string | null;
}

// Content DTOs mirror their Kotlin slices. PRD §5.7, §5.8, §5.9, §5.12.

/** GET /api/projects; the frontend formats the date range from raw fields. */
export interface ProjectView {
  iconUrl: string | null;
  /** Optional .glb planet; the active wave decides whether to display it. DESIGN §12.5. */
  modelUrl: string | null;
  title: string;
  description: string | null;
  startYear: number;
  startQuarter: number | null;
  endYear: number | null;
  endQuarter: number | null;
  /** Visible repository or website link. */
  url: string | null;
  /** Title and image destination; falls back to url when null. */
  homeUrl: string | null;
}

/** GET /api/social-links. */
export interface SocialLinkView {
  platform: string;
  name: string;
  url: string;
  icon: string | null;
}

/** GET /api/instagram/latest; 204 becomes null. Images are backend-hosted; hidden counters are null. PRD §5.17. */
export interface InstagramPostView {
  username: string;
  permalink: string;
  caption: string | null;
  /** Instagram media type: IMAGE, VIDEO, or CAROUSEL_ALBUM. */
  mediaType: string;
  imageUrl: string | null;
  avatarUrl: string | null;
  likes: number | null;
  comments: number | null;
  /** ISO-8601 UTC; relative age is calculated by the frontend. */
  postedAt: string;
}

/** GET /api/telegram/profile; 204 becomes null. Avatar is backend-hosted; profile link comes from social links. PRD §5.18. */
export interface TelegramProfileView {
  name: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
}

/** GET /api/artifacts; firstMentionedOn appears only in the hover card. PRD §5.8. */
export interface ArtifactView {
  id: number;
  name: string;
  /** PNG/GIF; null uses the pixel placeholder. */
  imageUrl: string | null;
  firstMentionedOn: string;
  /** Whether the item may rotate sideways in a perpendicular marquee. DESIGN §7.2. */
  rotatable?: boolean;
  /** The item's own `.glb`; null keeps it out of editions built on volume. DESIGN §7.2. */
  model3dUrl?: string | null;
}

/** GET /api/theme/active or /api/themes; tokens become :root CSS properties named --<key>. */
export interface ThemeView {
  key: string;
  name: string;
  tokens: Record<string, string>;
  /** Wave layout overrides; null uses layout.ts defaults. DESIGN §10.1. */
  layout: WaveLayout | null;
  active: boolean;
  releasedAt: string;
}

/** Drop teaser: GET /api/drops. */
export interface FilmDropView {
  id: number;
  title: string;
  droppedOn: string;
  monthLabel: string | null;
  photoCount: number;
  coverPhotoUrl: string | null;
}

/** GET /api/drops/{id}; dimensions drive the modal's justified layout. */
export interface FilmPhotoView {
  /** Web image for the board and modal. */
  imageUrl: string;
  /** Thumbnail for grids and previews. */
  thumbUrl: string;
  width: number | null;
  height: number | null;
  /** Detected artifact highlights; absent or empty means no boxes. PRD §5.12. */
  artifacts?: ArtifactBoxView[];
}

/** Box coordinates are image fractions [0,1]; each layout scales them to its rendered size. */
export interface ArtifactBoxView {
  artifactId: number;
  name: string;
  /** Catalog image for the box tooltip; null when unavailable. */
  imageUrl?: string | null;
  /** Honor the marquee's sideways-rotation policy in box tooltips too. DESIGN §7.2. */
  rotatable?: boolean;
  /** The item's `.glb`: the card over a find shows the thing itself. DESIGN §7.5. */
  model3dUrl?: string | null;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Bearer-protected drop administration: /api/ingest/drops*; mirrors Kotlin film DTOs.

/** Drop management projection with its current cover. */
export interface AdminDropView {
  id: number;
  title: string;
  droppedOn: string;
  monthLabel: string | null;
  photoCount: number;
  coverPhotoId: number | null;
}

/** Photo in the admin cover picker. */
export interface AdminPhotoView {
  id: number;
  thumbUrl: string;
  /** Full web image for manual artifact annotation. PRD §5.12. */
  imageUrl: string;
  isCover: boolean;
  /** Detected artifacts, removable in admin. PRD §5.12. */
  artifacts?: ArtifactBoxView[];
  /** none / cw90 / ccw90 / r180 / ambiguous / manual; null means unchecked. */
  orientation: string | null;
}

/** Poll orientation status while state === running. */
export interface OrientationStatusView {
  /** idle / running / done / failed. */
  state: string;
  total: number;
  checked: number;
  rotated: number;
  /** No model response; remains unchecked until a later run. */
  skipped: number;
}

/** ZIP upload result with processed and skipped photo counts. */
export interface UploadResultView {
  drop: AdminDropView;
  processed: number;
  skipped: number;
}

/** GET /api/freshness; null lastIngestAt means no ingestion yet. PRD §8. */
export interface FreshnessView {
  lastIngestAt: string | null;
}

// Public bike DTOs mirror the Kotlin bike slice. PRD §5.13.

/** GET /api/rides; coordinates describe endpoints, not the route. */
export interface RideView {
  id: number;
  rideDate: string;
  startTime: string;
  finishTime: string;
  distanceMeters: number;
  durationSeconds: number;
  calories: number | null;
  /** Usage charge in kopecks, excluding separately paid access; null means unknown. */
  costKopecks: number | null;
  /** Access purchased for this ride, in kopecks; null when paid by another ride or absent from history. */
  accessKopecks: number | null;
  /** Covering package price, excluded from this ride's total to avoid double counting; null if bought by this ride or unknown. */
  coveredByTariffKopecks: number | null;
  /** accessKopecks + costKopecks; null when unknown. */
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

/** POST /api/ingest/bike/rides import counts. */
export interface BikeImportResultView {
  created: number;
  updated: number;
}

/** Current-month totals count each tariff purchase once; hide when rides === 0. PRD §5.13. */
export interface RideMonthSummaryView {
  /** YYYY-MM in MSK. */
  month: string;
  rides: number;
  durationSeconds: number;
  spentKopecks: number;
}

/** GET /api/rides/stats; zero totals until rides exist. */
export interface RideStatsView {
  totalRides: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCalories: number;
  longestRideMeters: number;
  firstRideDate: string | null;
  lastRideDate: string | null;
}

// Bearer-protected heatmap: GET /api/ingest/analytics/heatmap. PRD §5.11.

/** null tileId means outside tiles; clicks already apply the contribution cap. */
export interface HeatmapTileView {
  tileId: string | null;
  clicks: number;
  uniques: number;
}

/** Page heatmap over a date range. */
export interface HeatmapView {
  path: string;
  from: string;
  to: string;
  totalClicks: number;
  tiles: HeatmapTileView[];
}

/** Lightweight calendar and sparkline projection: GET /api/days?from=&to=. */
export interface DaySummary {
  date: string;
  title: string | null;
  hasData: boolean;
  steps: number | null;
  sleepMinutes: number | null;
  /** null = not collected; zero = collected with no contributions. Preserve this for calendar lenses. */
  contributions: number | null;
  /** Per-item counts including zeros; lenses need occurrence thresholds. Missing cached values mean unknown. PRD §5.3. */
  disciplineCounts?: Record<string, number>;
  /** Same tri-state as DayView: absent/null = unreported, true = consumed, false = abstained. */
  monsterDrunk?: boolean | null;
}

/** Admin artifact form: /api/ingest/artifacts. PRD §5.8. */
export interface AdminArtifactView {
  id: number;
  name: string;
  imageUrl: string | null;
  firstMentionedOn: string;
  rotatable: boolean;
  /** Visual description used to detect the item in photos. PRD §5.12. */
  detectionHint: string | null;
  /** Uploaded `.glb`, or null while the item has no model. DESIGN §12.5. */
  model3dUrl: string | null;
}

/** Ordering derives from firstMentionedOn, oldest first; there is no independent position field. */
export interface ArtifactInput {
  name: string;
  firstMentionedOn: string;
  rotatable: boolean;
  detectionHint: string | null;
}

/** Poll the drop's artifact scan while state === running. PRD §5.12. */
export interface ArtifactScanStatusView {
  state: "idle" | "queued" | "running" | "done" | "failed" | "cancelled";
  total: number;
  checked: number;
  found: number;
  skipped: number;
}

/** Aggregate scan status across all drops. PRD §5.12. */
export interface ArtifactScanRunView {
  state: "idle" | "running" | "done" | "failed" | "cancelled";
  total: number;
  checked: number;
  found: number;
  /** Many skips with no detections usually indicate a silent provider. */
  skipped: number;
  drops: number;
  dropsDone: number;
  /** Target item name; null when scanning the whole catalog. */
  artifactName: string | null;
}
