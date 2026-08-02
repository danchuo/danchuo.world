import type { AdminArtifactView, AdminDropView, AdminPhotoView, ArtifactInput, ArtifactScanRunView, ArtifactScanStatusView, BikeImportResultView, HeatmapView, OrientationStatusView, UploadResultView } from "./types";

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

/**
 * Запустить LLM-проверку поворота кадров дропа (B9). Возвращает стартовый статус; дальше
 * прогресс поллится через {@link getOrientationStatus}. Идемпотентно (бегущий прогон не дублируется).
 */
export async function startOrientationCheck(token: string, dropId: number): Promise<OrientationStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/orientation`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as OrientationStatusView;
}

/** Статус проверки поворота дропа (B9). */
export async function getOrientationStatus(token: string, dropId: number): Promise<OrientationStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/orientation`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as OrientationStatusView;
}

/**
 * Ручной поворот кадра на 90° по часовой (B9, override ошибки LLM). В ответ — обновлённый
 * список кадров дропа (свежие thumb-URL с `?v=` cache-bust).
 */
export async function rotatePhoto(token: string, dropId: number, photoId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos/${photoId}/rotate`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ rotation: "cw90" }),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/**
 * Удалить один кадр дропа (неудачный) — `DELETE …/photos/{photoId}`. Возврата нет (перезалей
 * дроп, если что); в ответ — свежий список кадров (обложка переназначается, если удалили её).
 */
export async function deletePhoto(token: string, dropId: number, photoId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Удалить дроп (кадры + файлы). */
export async function deleteDrop(token: string, dropId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}

/**
 * Импорт истории поездок Велобайка (B4, PRD §5.13) — `POST /api/ingest/bike/rides` за тем же bearer.
 * `rides` — сырой массив `content[]`, собранный букмарклетом внутри залогиненной PWA `pwa.velobike.ru`
 * (серверный поллер упирается в Qrator, §13 — поэтому доставка идёт из авторизованного браузера).
 * Идемпотентно по id аренды: повтор не плодит дубли.
 */
export async function importBikeRides(token: string, rides: unknown[]): Promise<BikeImportResultView> {
  const res = await fetch(`${BASE}/api/ingest/bike/rides`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(rides),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as BikeImportResultView;
}

/**
 * Импорт истории покупок тарифов Велобайка (B4, PRD §5.13) — `POST /api/ingest/bike/tariffs`.
 * `purchases` — записи `purchaseType === "TARIFF"` из `purchases/history`, собранные тем же
 * букмарклетом. Нужны, чтобы бесплатные поездки показать как «в рамках тарифа за N ₽». Записи
 * `RENTAL` бэк отсеивает сам. Идемпотентно по id платежа.
 */
export async function importBikeTariffs(token: string, purchases: unknown[]): Promise<BikeImportResultView> {
  const res = await fetch(`${BASE}/api/ingest/bike/tariffs`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(purchases),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as BikeImportResultView;
}

/**
 * Хитмапа кликов по тайлам борда (B2) — `GET /api/ingest/analytics/heatmap`, за тем же bearer.
 * `from`/`to` — даты MSK (ISO `yyyy-MM-dd`); пусто ⇒ серверный дефолт (последние 30 дней).
 */
export async function getHeatmap(
  token: string,
  path = "/",
  from?: string,
  to?: string,
): Promise<HeatmapView> {
  const qs = new URLSearchParams({ path });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`${BASE}/api/ingest/analytics/heatmap?${qs.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as HeatmapView;
}

// ── Артефакты (PRD §5.8): раньше новый предмет означал миграцию, теперь — форма ──

export async function listArtifactsAdmin(token: string): Promise<AdminArtifactView[]> {
  const res = await fetch(`${BASE}/api/ingest/artifacts`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView[];
}

export async function createArtifact(
  token: string,
  input: ArtifactInput,
): Promise<AdminArtifactView> {
  const res = await fetch(`${BASE}/api/ingest/artifacts`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

export async function updateArtifact(
  token: string,
  id: number,
  input: ArtifactInput,
): Promise<AdminArtifactView> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

export async function deleteArtifact(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}

export async function uploadArtifactImage(
  token: string,
  id: number,
  image: File,
): Promise<AdminArtifactView> {
  const form = new FormData();
  form.append("image", image);
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/image`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

/**
 * Попросить дешёвую модель описать предмет по его картинке. `null` — модель не настроена или
 * промолчала: это штатный ответ, поле дозаполняется руками.
 */
export async function suggestArtifactHint(token: string, id: number): Promise<string | null> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/hint`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return ((await res.json()) as { hint: string | null }).hint;
}

/** Искать артефакты на кадрах ВСЕХ дропов — путь «завели предмет, ищем в старом архиве». */
/**
 * Прогон по всему архиву. [artifactId] сужает его до одного предмета — так новый артефакт
 * ищется, не задевая находки остальных. Дешевле от этого не становится: вызов один на кадр.
 */
export async function scanArtifactsEverywhere(
  token: string,
  artifactId?: number,
): Promise<ArtifactScanRunView> {
  const query = artifactId === undefined ? "" : `?artifactId=${artifactId}`;
  const res = await fetch(`${BASE}/api/ingest/artifact-scan${query}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Сводка по прогону архива — поллится, пока `state === "running"`. */
export async function getArtifactScanRun(token: string): Promise<ArtifactScanRunView> {
  const res = await fetch(`${BASE}/api/ingest/artifact-scan`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Остановить прогон архива. 409, если останавливать нечего. */
export async function cancelArtifactScan(token: string): Promise<ArtifactScanRunView> {
  const res = await fetch(`${BASE}/api/ingest/artifact-scan`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Запустить поиск артефактов по кадрам одного дропа (§5.12). */
export async function startArtifactScan(
  token: string,
  dropId: number,
): Promise<ArtifactScanStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/artifacts`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanStatusView;
}

export async function getArtifactScanStatus(
  token: string,
  dropId: number,
): Promise<ArtifactScanStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/artifacts`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanStatusView;
}

/** Снять рамку артефакта с кадра (ошибка модели или передумали). Возвращает свежие кадры. */
export async function deleteArtifactBox(
  token: string,
  dropId: number,
  photoId: number,
  artifactId: number,
): Promise<AdminPhotoView[]> {
  const res = await fetch(
    `${BASE}/api/ingest/drops/${dropId}/photos/${photoId}/artifacts/${artifactId}`,
    { method: "DELETE", headers: authHeaders(token) },
  );
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}
