import type {
  ArtifactView,
  DaySummary,
  DayView,
  FilmDropView,
  FilmPhotoView,
  FreshnessView,
  NowPlayingView,
  ProjectView,
  RecentTrackView,
  RandomPathView,
  RideMonthSummaryView,
  RideStatsView,
  RideView,
  SleepNightView,
  SocialLinkView,
  SummaryView,
  ThemeView,
} from "./types";
import type { SummaryKind } from "../summarySubject";

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

/**
 * Деталь ночи (`GET /api/sleep/night/{date}`) — полоса ночи и «обычная ночь» за 30 дней.
 * Тайл «Сон» ходит сюда, только когда полосу попросили показать: борду она не нужна.
 */
export function getSleepNight(date: string, init?: RequestInit): Promise<SleepNightView> {
  return getJson<SleepNightView>(`/api/sleep/night/${date}`, init);
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

/** Свежесть данных (`GET /api/freshness`, PRD §8) — момент последнего приёма ingest. */
export function getFreshness(init?: RequestInit): Promise<FreshnessView> {
  return getJson<FreshnessView>(`/api/freshness`, init);
}

/** Поездки Велобайка (`GET /api/rides`, PRD §9 B4), новые сверху; до ingest — пусто. */
export function getRides(init?: RequestInit): Promise<RideView[]> {
  return getJson<RideView[]>(`/api/rides`, init);
}

/**
 * Пересказ пройденного куска (`GET /api/summary/{kind}/{id}`, PRD §5.16.1) — тянется лениво,
 * когда окно раскрыли. В проекции дня едет только флаг `hasSummary`: текст на несколько строк
 * не нужен ни календарю, ни карточке, а дней в окне — десятки.
 *
 * Точка одна на все виды заходов: строка на бэкенде тоже одна, различается только ключ.
 */
export function getSummary(
  kind: SummaryKind,
  sessionId: number,
  init?: RequestInit,
): Promise<SummaryView> {
  return getJson<SummaryView>(`/api/summary/${kind}/${sessionId}`, init);
}

/** Агрегат истории поездок (`GET /api/rides/stats`). */
export function getRideStats(init?: RequestInit): Promise<RideStatsView> {
  return getJson<RideStatsView>(`/api/rides/stats`, init);
}

/** Сводка за текущий календарный месяц (`GET /api/rides/month-summary`) — шапка модалки поездок. */
export function getRideMonthSummary(init?: RequestInit): Promise<RideMonthSummaryView> {
  return getJson<RideMonthSummaryView>(`/api/rides/month-summary`, init);
}

/**
 * Пачка придуманных путей поездки (`GET /api/rides/{id}/random-paths`, PRD §9 B4). Приходит
 * сразу несколькими, а не по одному на нажатие: правило «два подряд рядом не лежат» соблюдается
 * на бэке, где живёт алгоритм, и ни одной из сторон не нужно помнить предыдущий путь.
 */
export function getRandomPaths(rideId: number, init?: RequestInit): Promise<RandomPathView[]> {
  return getJson<RandomPathView[]>(`/api/rides/${rideId}/random-paths`, init);
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

/** Один клик для хитмапы (B2): тайл + доля внутри него (0..1). `tileId` null — клик мимо плиток. */
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

/**
 * Батч кликов хитмапы (`POST /api/analytics/interactions`, PRD §5.11 B2) — публичный, cookieless.
 * Шлётся одним пакетом на уходе через `navigator.sendBeacon` (переживает выгрузку вкладки, не
 * спамит по событию). Без кликов не шлём. Сбой телеметрии глотаем (не критично).
 */
export function postInteractions(payload: InteractionsPayload): void {
  if (payload.clicks.length === 0) return;
  const url = `${BASE}/api/analytics/interactions`;
  const body = JSON.stringify(payload);
  const blob = new Blob([body], { type: "application/json" });
  if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, blob)) return;
  // Фолбэк, если sendBeacon недоступен/отказал — keepalive-fetch.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}
