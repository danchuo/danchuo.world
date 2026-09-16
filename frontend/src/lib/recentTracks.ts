/**
 * Collapsing Spotify's recent tracks (§5.5) — a pure calculation kept apart from the component:
 * `MusicTile.tsx` must export components only, or Fast Refresh loses state on every edit.
 */

import type { RecentTrackView, TrackView } from "@/lib/api/types";

/** A recent track's identity for collapsing: the url, or failing that title plus artist names. */
function recentKey(t: TrackView): string {
  return t.url ?? `${t.title} | ${t.artists.map((a) => a.name).join(", ")}`;
}

/**
 * Collapses CONSECUTIVE identical tracks into one row (a track replayed right after itself),
 * keeping the first — freshest — of the run (§5.5). Repeats further apart are separate listens.
 */
export function collapseConsecutiveRecent(recent: RecentTrackView[]): RecentTrackView[] {
  const out: RecentTrackView[] = [];
  let prevKey: string | null = null;
  for (const r of recent) {
    const key = recentKey(r.track);
    if (key === prevKey) continue;
    out.push(r);
    prevKey = key;
  }
  return out;
}

/**
 * How long ago a track played, as one short label. Units are truncated DOWN like the player's clock
 * (119 minutes is still "1 h"), zero minutes never prints — it reads as a broken counter rather
 * than freshness — and the ladder deliberately stops at days. PRD §5.5
 */
export function formatPlayedAgo(playedAt: string | null, nowMs: number): string | null {
  if (!playedAt) return null;
  const at = Date.parse(playedAt);
  if (Number.isNaN(at)) return null;

  const minutes = Math.floor(Math.max(0, nowMs - at) / 60_000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}
