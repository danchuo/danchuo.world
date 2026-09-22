import type {
  ArtifactView,
  DaySummary,
  DayView,
  FilmDropView,
  FilmPhotoView,
  FreshnessView,
  InstagramPostView,
  TelegramProfileView,
  NowPlayingView,
  ProjectView,
  RecentTrackView,
  RideMonthSummaryView,
  RideStatsView,
  RideView,
  SleepNightView,
  SocialLinkView,
  SummaryView,
} from "./types";
import type { SummaryKind } from "../summarySubject";
import { withDemoBouldering } from "../bouldering";
import { mskToday } from "../date";

/** Public Quarkus JSON reads require no token. An empty NEXT_PUBLIC_API_BASE_URL uses same-origin paths. PRD §3. */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Запрос ${url} вернул ${status}`);
    this.name = "ApiError";
  }
}

/** Baked in at build time; only the local compose stack sets it. See [withDemoBouldering]. */
const DEMO_BOULDERING = process.env.NEXT_PUBLIC_DEMO_BOULDERING === "1";

/** Get the full day projection. */
export async function getDay(date: string, init?: RequestInit): Promise<DayView> {
  const day = await getJson<DayView>(`/api/days/${date}`, init);
  return withDemoBouldering(day, DEMO_BOULDERING, mskToday());
}

/** Get day summaries for the calendar and charts. */
export function getDays(from: string, to: string, init?: RequestInit): Promise<DaySummary[]> {
  const qs = new URLSearchParams({ from, to }).toString();
  return getJson<DaySummary[]>(`/api/days?${qs}`, init);
}

/** Load the night strip and 30-day baseline only when requested by the sleep tile. */
export function getSleepNight(date: string, init?: RequestInit): Promise<SleepNightView> {
  return getJson<SleepNightView>(`/api/sleep/night/${date}`, init);
}

/** Get current Spotify playback; IDLE means nothing is playing. */
export function getNowPlaying(init?: RequestInit): Promise<NowPlayingView> {
  return getJson<NowPlayingView>(`/api/spotify/now-playing`, init);
}

/** Get recent Spotify tracks. */
export function getRecent(limit = 8, init?: RequestInit): Promise<RecentTrackView[]> {
  return getJson<RecentTrackView[]>(`/api/spotify/recent?limit=${limit}`, init);
}

// Public content: PRD §5.7, §5.8, §5.9, §5.12.

/** Get projects, newest first. */
export function getProjects(init?: RequestInit): Promise<ProjectView[]> {
  return getJson<ProjectView[]>(`/api/projects`, init);
}

/** Get social links. */
export function getSocialLinks(init?: RequestInit): Promise<SocialLinkView[]> {
  return getJson<SocialLinkView[]>(`/api/social-links`, init);
}

/** Return null for an empty 204 response: parsing it as JSON would turn an unconnected account into an error. PRD §5.17. */
export async function getLatestInstagramPost(init?: RequestInit): Promise<InstagramPostView | null> {
  const url = `${BASE}/api/instagram/latest`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (res.status === 204) return null;
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as InstagramPostView;
}

/** Return null for an empty 204 Telegram profile response; never parse its absent body. PRD §5.18. */
export async function getTelegramProfile(init?: RequestInit): Promise<TelegramProfileView | null> {
  const url = `${BASE}/api/telegram/profile`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (res.status === 204) return null;
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as TelegramProfileView;
}

/** Get marquee artifacts. */
export function getArtifacts(init?: RequestInit): Promise<ArtifactView[]> {
  return getJson<ArtifactView[]>(`/api/artifacts`, init);
}

/** Get photo drops. */
export function getDrops(init?: RequestInit): Promise<FilmDropView[]> {
  return getJson<FilmDropView[]>(`/api/drops`, init);
}

/** Get photos in a drop. */
export function getDrop(id: number, init?: RequestInit): Promise<FilmPhotoView[]> {
  return getJson<FilmPhotoView[]>(`/api/drops/${id}`, init);
}

/** Get the latest ingest timestamp. PRD §8. */
export function getFreshness(init?: RequestInit): Promise<FreshnessView> {
  return getJson<FreshnessView>(`/api/freshness`, init);
}

/** Get rides, newest first; empty until imported. PRD §9 B4. */
export function getRides(init?: RequestInit): Promise<RideView[]> {
  return getJson<RideView[]>(`/api/rides`, init);
}

/** Load a session summary on expansion; day projections carry only hasSummary. PRD §5.16.1. */
export function getSummary(
  kind: SummaryKind,
  sessionId: number,
  init?: RequestInit,
): Promise<SummaryView> {
  return getJson<SummaryView>(`/api/summary/${kind}/${sessionId}`, init);
}

/** Get aggregate ride history statistics. */
export function getRideStats(init?: RequestInit): Promise<RideStatsView> {
  return getJson<RideStatsView>(`/api/rides/stats`, init);
}

/** Get the current calendar month's ride summary for the modal header. */
export function getRideMonthSummary(init?: RequestInit): Promise<RideMonthSummaryView> {
  return getJson<RideMonthSummaryView>(`/api/rides/month-summary`, init);
}

/** Public cookieless beacon: the load ping and every exit flush of a visit. PRD §5.11 */
export function postBeacon(payload: BeaconPayload): void {
  send(`${BASE}/api/analytics/beacon`, payload);
}

export interface BeaconPayload {
  visitId: string;
  path: string;
  /** Foreground time, not wall time: a backgrounded tab stops accruing. PRD §5.11 */
  dwellMs?: number;
  scrollPct?: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  waveKey?: string;
  viewportW?: number;
  viewportH?: number;
}

/**
 * Telemetry leaves by `sendBeacon`, the only transport that survives tab unload, and falls back
 * to a keepalive fetch where it is unavailable or refuses the payload. Failure is nonfatal.
 */
function send(url: string, payload: unknown): void {
  const body = JSON.stringify(payload);
  const blob = new Blob([body], { type: "application/json" });
  if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, blob)) return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Fractions inside the tile, or inside the VIEWPORT when tileId is null (a click on the ground). */
export interface ClickPayload {
  tileId: string | null;
  offsetXPct: number;
  offsetYPct: number;
  viewportW: number;
}

export interface InteractionsPayload {
  visitId: string;
  path: string;
  clicks: ClickPayload[];
}

/** A click batch; an empty one is not worth a request. PRD §5.11 B2 */
export function postInteractions(payload: InteractionsPayload): void {
  if (payload.clicks.length === 0) return;
  send(`${BASE}/api/analytics/interactions`, payload);
}

/** A visitor's note. Every answer is optional; the server demands at least one. PRD §5.19. */
export interface FeedbackPayload {
  likedMost?: string;
  wouldChange?: string;
  missingBlock?: string;
  signature?: string;
  path: string;
  waveKey?: string;
  selectedDay?: string;
  viewportW?: number;
  viewportH?: number;
  screenW?: number;
  screenH?: number;
  language?: string;
  /** The honeypot: hidden in the form and always empty for a human. Filled ⇒ the server drops it. */
  website?: string;
}

/** Why the server refused a note; the form turns the code into a line of Russian. */
export class FeedbackError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(`Записка отклонена: ${code}`);
    this.name = "FeedbackError";
  }
}

/**
 * Send a note. Unlike the telemetry POSTs this one is AWAITED and may throw: the visitor wrote to
 * the author and must learn whether it arrived, so a failure is never swallowed. PRD §5.19.
 */
export async function postFeedback(payload: FeedbackPayload): Promise<void> {
  const url = `${BASE}/api/feedback`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  let code = "unknown";
  let field: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; field?: string };
    code = body.error ?? code;
    field = body.field;
  } catch {
    // A non-JSON failure (429 from the edge, a proxy error) has no application code.
    code = res.status === 429 ? "rate_limited" : `http_${res.status}`;
  }
  throw new FeedbackError(code, field);
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}
