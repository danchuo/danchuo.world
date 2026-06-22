import type { AdminDropView, AdminPhotoView, UploadResultView } from "./types";

/**
 * Админ-клиент фото-дропов (B1, PRD §5.12, §9 п.8) — `/api/ingest/drops*` за статическим bearer
 * (тот же токен, что у ingest-шортката). Токен передаётся явно из формы /admin (хранится в
 * sessionStorage там же, не в коде). Только владельческие операции: загрузка zip, список,
 * выбор обложки, удаление. Публичное чтение борда — в `client.ts`.
 */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(`Админ-запрос вернул ${status}${errorCode ? ` (${errorCode})` : ""}`);
    this.name = "AdminApiError";
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function parseError(res: Response): Promise<never> {
  let code: string | undefined;
  try {
    code = ((await res.json()) as { error?: string }).error;
  } catch {
    // тело не JSON — оставляем код пустым
  }
  throw new AdminApiError(res.status, code);
}

/**
 * Загрузить дроп: zip с кадрами + название + дата (ISO `yyyy-MM-dd`). Прогресс аплоада не
 * показываем — он вводит в заблуждение (через прокс­и/локально браузер «отправляет» почти мгновенно,
 * а реальное время уходит на форвард + ресайз ~36 кадров на сервере). UI вместо этого показывает
 * счётчик секунд до ответа.
 */
export async function uploadDrop(
  token: string,
  zip: File,
  title: string,
  date: string,
): Promise<UploadResultView> {
  const form = new FormData();
  form.append("zip", zip);
  form.append("title", title);
  form.append("date", date);
  const res = await fetch(`${BASE}/api/ingest/drops`, {
    method: "POST",
    headers: authHeaders(token), // Content-Type выставит сам FormData (boundary)
    body: form,
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as UploadResultView;
}

/** Список дропов для управления. Заодно проверяет токен (401 — неверный). */
export async function listDropsAdmin(token: string): Promise<AdminDropView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminDropView[];
}

/** Кадры дропа с id + thumb (для сетки выбора обложки). */
export async function getDropPhotosAdmin(token: string, dropId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Пометить кадр обложкой дропа. */
export async function setCover(token: string, dropId: number, photoId: number): Promise<AdminDropView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/cover`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ photoId }),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminDropView;
}

/** Удалить дроп (кадры + файлы). */
export async function deleteDrop(token: string, dropId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}
