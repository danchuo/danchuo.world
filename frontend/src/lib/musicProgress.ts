/**
 * The playhead: where Spotify is inside a track. The backend gives `progressMs` as a snapshot while
 * polling runs every ~20s, so between answers the head is ADVANCED BY THE CLOCK — the server gives
 * the anchor, the client the motion. A pure module, which is what makes the arithmetic testable.
 */

/** Playhead snapshot: what the server said, and the moment that answer arrived. */
export interface ProgressSample {
  /** The playhead from `/api/spotify/now-playing`; `null` means the server did not give one. */
  progressMs: number | null;
  /** `Date.now()` at the moment the answer arrived — the anchor the travel is counted from. */
  atMs: number;
  /** Paused ⇒ the playhead does not move, however much time passes. */
  isPlaying: boolean;
}

/**
 * The head NOW: a snapshot plus the time since it, and only while playing. Two ceilings, both from
 * life: a tab may sit hidden for half an hour with polling deliberately stopped, and system clocks
 * can jump backwards, so a negative delta is floored at zero rather than rewinding the head.
 */
export function elapsedMs(
  sample: ProgressSample,
  nowMs: number,
  durationMs: number | null,
): number | null {
  const { progressMs, atMs, isPlaying } = sample;
  if (progressMs == null) return null;
  if (!isPlaying) return progressMs;
  const drift = Math.max(0, nowMs - atMs);
  const elapsed = progressMs + drift;
  return durationMs != null ? Math.min(elapsed, durationMs) : elapsed;
}

/** Share covered [0, 1]; `null` when there is nothing to compute from (no playhead or no duration). */
export function progressRatio(elapsed: number | null, durationMs: number | null): number | null {
  if (elapsed == null || durationMs == null || durationMs <= 0) return null;
  return Math.min(1, Math.max(0, elapsed / durationMs));
}

/**
 * The player's clock: `m:ss`, or `h:mm:ss` when long. Seconds are truncated rather than rounded —
 * on a player 1:47.9 is still 1:47, a second arrives rather than approaches. Nothing to show gives
 * a dash of the same width, so the line does not jump when the head appears.
 */
export function formatClock(ms: number | null): string {
  if (ms == null) return "–:––";
  const total = Math.floor(Math.max(0, ms) / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * How old a snapshot may be for advancing the playhead from it to still make sense.
 *
 * Five minutes is not a round number but a rough upper bound on one track: a snapshot that old knows
 * nothing about the playhead, nor even whether anything is playing.
 */
export const HEAD_MAX_AGE_MS = 5 * 60_000;

/**
 * The scale's anchor, from a server answer OR its localStorage copy, carrying its OWN timestamp
 * rather than the moment of reading. That is the whole point: after a reload within the poll window
 * the scale sits where the head really is. A copy older than the cap cannot anchor anything.
 */
export function headSample(
  progressMs: number | null,
  atMs: number,
  isPlaying: boolean,
  nowMs: number,
): ProgressSample {
  const fresh = nowMs - atMs <= HEAD_MAX_AGE_MS;
  return fresh
    ? { progressMs, atMs, isPlaying }
    : { progressMs: null, atMs, isPlaying: false };
}
