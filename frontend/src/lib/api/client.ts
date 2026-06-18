import type { DaySummary, DayView } from "./types";

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

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}
