import type {
  ArtifactView,
  DaySummary,
  DayView,
  FilmDropView,
  FilmPhotoView,
  NowPlayingView,
  ProjectView,
  RecentTrackView,
  SocialLinkView,
  ThemeView,
} from "./types";

/**
 * JSON-клиент к Quarkus (PRD §3 — фронт изолирован в клиента к бэкенду). Только публичное
 * чтение дней (M2); все GET без токена (креды нужны лишь на `/api/ingest/*`).
 *
 * База — `NEXT_PUBLIC_API_BASE_URL`; пусто ⇒ относительные пути (за обратным прокси Caddy).
 */

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

/** Полная проекция дня (`GET /api/days/{date}`). */
export function getDay(date: string, init?: RequestInit): Promise<DayView> {
  return getJson<DayView>(`/api/days/${date}`, init);
}

/** Сводки диапазона для календаря/мини-графика (`GET /api/days?from=&to=`). */
export function getDays(from: string, to: string, init?: RequestInit): Promise<DaySummary[]> {
  const qs = new URLSearchParams({ from, to }).toString();
  return getJson<DaySummary[]>(`/api/days?${qs}`, init);
}

/** Текущий трек Spotify (`GET /api/spotify/now-playing`). IDLE, если ничего не играет. */
export function getNowPlaying(init?: RequestInit): Promise<NowPlayingView> {
  return getJson<NowPlayingView>(`/api/spotify/now-playing`, init);
}

/** Недавние треки Spotify (`GET /api/spotify/recent?limit=`). */
export function getRecent(limit = 8, init?: RequestInit): Promise<RecentTrackView[]> {
  return getJson<RecentTrackView[]>(`/api/spotify/recent?limit=${limit}`, init);
}

// ── Контент M4 (PRD §5.7/§5.8/§5.9/§5.12). Всё публичное чтение, без токена. ──

/** Проекты (`GET /api/projects`), новые сверху. */
export function getProjects(init?: RequestInit): Promise<ProjectView[]> {
  return getJson<ProjectView[]>(`/api/projects`, init);
}

/** Соцссылки (`GET /api/social-links`). */
export function getSocialLinks(init?: RequestInit): Promise<SocialLinkView[]> {
  return getJson<SocialLinkView[]>(`/api/social-links`, init);
}

/** Артефакты marquee (`GET /api/artifacts`). */
export function getArtifacts(init?: RequestInit): Promise<ArtifactView[]> {
  return getJson<ArtifactView[]>(`/api/artifacts`, init);
}

/** Активная волна (`GET /api/theme/active`) — токены для инжекта в `:root`. */
export function getActiveTheme(init?: RequestInit): Promise<ThemeView> {
  return getJson<ThemeView>(`/api/theme/active`, init);
}

/** Выпущенные волны (`GET /api/themes`) — для переключателя. */
export function getThemes(init?: RequestInit): Promise<ThemeView[]> {
  return getJson<ThemeView[]>(`/api/themes`, init);
}

/** Список фото-дропов (`GET /api/drops`); до B1 — пусто. */
export function getDrops(init?: RequestInit): Promise<FilmDropView[]> {
  return getJson<FilmDropView[]>(`/api/drops`, init);
}

/** Кадры дропа (`GET /api/drops/{id}`). */
export function getDrop(id: number, init?: RequestInit): Promise<FilmPhotoView[]> {
  return getJson<FilmPhotoView[]>(`/api/drops/${id}`, init);
}

/**
 * Бикон аналитики (`POST /api/analytics/beacon`, PRD §5.11) — публичный, cookieless.
 * Load-фаза: `fetch` с `keepalive`. Уход (`visibilitychange`/`pagehide`): см. `AnalyticsBeacon`
 * — там `navigator.sendBeacon` (надёжнее при выгрузке). Сбой бикона глотаем (телеметрия не критична).
 */
export function postBeacon(payload: BeaconPayload): void {
  const url = `${BASE}/api/analytics/beacon`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export interface BeaconPayload {
  visitId: string;
  path: string;
  dwellMs?: number;
  referrer?: string;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}
