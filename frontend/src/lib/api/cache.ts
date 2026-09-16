/** Optional localStorage display cache with schema versioning and expiry; stale data survives network failures. PRD §7. */

const PREFIX = "dw:cache:v1:";

/** Do not display snapshots older than one day. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Entry<T> {
  t: number;
  v: T;
}

/** Return the latest valid cached value, or null for missing, expired or unavailable storage. */
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

/** Cache a successful response; storage failure must not fail the tile. */
export function writeCache<T>(key: string, value: T): void {
  try {
    const entry: Entry<T> = { t: Date.now(), v: value };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /** Quota, private mode and SSR may disable this optional cache. */
  }
}
