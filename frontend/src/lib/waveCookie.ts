/**
 * Wave preference cookie (PRD §5.9): the wave picked in the switcher must survive a page
 * reload. The client writes the wave key here on every swap; SSR (layout/page) reads it and
 * renders the preferred wave straight away — no flash of the owner's active wave.
 * Cookie (not localStorage) precisely because the server must see it on first byte.
 */

export const WAVE_COOKIE = "danchuo_wave";

/** One year — the choice lives until the visitor picks another wave. */
const WAVE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client-side: persist the picked wave key (no-op during SSR). */
export function rememberWave(key: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${WAVE_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${WAVE_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Client-side: read the picked wave key from `document.cookie` (`null` during SSR or when
 * absent). Used by the switcher to self-heal when SSR degraded (backend down/rate-limited)
 * and the page rendered without a resolved wave.
 */
export function readWaveCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${WAVE_COOKIE}=([^;]*)`));
  return decodeWaveCookie(match?.[1]);
}

/** Raw cookie value → wave key; `null` for absent/malformed values (graceful). */
export function decodeWaveCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
