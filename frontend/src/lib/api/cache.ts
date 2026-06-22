/**
 * Лёгкий клиентский кэш ответов тайлов в `localStorage` (stale-while-revalidate, PRD §7 —
 * per-tile состояния). Цель — не обнулять борд, когда повторный запрос не прошёл (например,
 * сработал мягкий рейтлимит публичных GET после серии F5): тайл показывает последнюю удачную
 * копию, а не пустоту, и тихо обновляет её, когда сеть снова ответит.
 *
 * Это копия для отображения, не источник правды: версия схемы и TTL гасят протухшее, а сбой
 * хранилища (приватный режим/квота/SSR) глотается — кэш необязателен.
 */

const PREFIX = "dw:cache:v1:";

/** Старше суток не показываем — лучше честный лоадер, чем вчерашний снимок. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Entry<T> {
  t: number;
  v: T;
}

/** Последняя удачная копия для ключа, либо `null` (нет/протухла/хранилище недоступно). */
export function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.t !== "number" || Date.now() - entry.t > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.v;
  } catch {
    return null;
  }
}

/** Сохранить удачный ответ как копию для отображения. Сбой хранилища несущественен. */
export function writeCache<T>(key: string, value: T): void {
  try {
    const entry: Entry<T> = { t: Date.now(), v: value };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* квота/приватный режим/SSR — кэш необязателен */
  }
}
