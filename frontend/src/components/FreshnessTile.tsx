"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getFreshness } from "@/lib/api/client";
import type { FreshnessView } from "@/lib/api/types";
import { formatAgo } from "@/lib/format";
import { HoverTip } from "./HoverTip";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface FreshnessTileProps {
  style?: CSSProperties;
  className?: string;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * The data-freshness indicator: quietly shows when the phone last reached ingest. An empty
 * `lastIngestAt` means no intake yet and renders a quiet empty state. The label recomputes once a
 * minute so the freshness indicator does not itself go stale. PRD §8
 */
export function FreshnessTile({ style, className }: FreshnessTileProps) {
  const { phase, data, retry } = useTileData<FreshnessView>(
    useCallback((signal) => getFreshness({ signal }), []),
    "freshness",
  );

  // A tick a minute: "N min ago" must not stick at whatever it was when the page loaded.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const at = data?.lastIngestAt ?? null;
  const isEmpty = phase === "loaded" && at === null;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет приёмов"
      onRetry={retry}
      /* The tile's label is not a word but an 8-bit dial-up: a computer, a phone and a planet on
         the wire. It says what the tile says — data arrived down the wires — and the word survives
         as the picture's name for a screen reader. */
      label={
        <HoverTip phrase text="время, когда последний раз обновлялись данные">
          <span data-testid="freshness-dialup" className="t-fresh-dialup" role="img" aria-label="свежесть" />
        </HoverTip>
      }
      ariaLabel="Свежесть данных"
      // The tile is tiny (3 columns), so the base type size is damped by a class to fit the empty
      // and error text; the size itself is a fraction of the tile, not a pixel (DESIGN §8.1).
      style={style}
      className={`t-fresh ${className ?? ""}`}
    >
      {phase === "loaded" && at !== null && (
        // A single "N ago" line only. The tile is tiny (3x3 tracks) and a second caption line used
        // to overflow the centred flex container and overlap the tile label above it. The label
        // already carries that meaning; overflow-hidden guards the extreme values.
        <div className="tile-frame flex h-full flex-col justify-center overflow-hidden" style={mono}>
          <span data-testid="freshness-ago" className="t-fresh-ago" style={{ color: "var(--text-primary)" }}>
            {formatAgo(at)}
          </span>
        </div>
      )}
    </TileShell>
  );
}
