"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getFreshness } from "@/lib/api/client";
import type { FreshnessView } from "@/lib/api/types";
import { formatAgo } from "@/lib/format";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface FreshnessTileProps {
  style?: CSSProperties;
  className?: string;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Индикатор свежести данных (F) — PRD §8, эра M5. Тихо показывает, когда телефон последний
 * раз достучался до ingest («N назад»). Тянет `GET /api/freshness` сам; `lastIngestAt` пусто
 * (приёмов ещё не было) ⇒ тихий empty, борд не ломается. Метка пересчитывается раз в минуту,
 * чтобы сам индикатор свежести не «застывал».
 */
export function FreshnessTile({ style, className }: FreshnessTileProps) {
  const { phase, data, retry } = useTileData<FreshnessView>(
    useCallback((signal) => getFreshness({ signal }), []),
    "freshness",
  );

  // Тик раз в минуту: «N мин назад» не должно застревать на значении момента загрузки.
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
      label="свежесть"
      ariaLabel="Свежесть данных"
      // Плитка крошечная (3 кол.) — гасим базовый кегль, чтобы empty/error-текст влезал.
      style={{ ...style, fontSize: 11 }}
      className={className}
    >
      {phase === "loaded" && at !== null && (
        // Single "N назад" line only. The tile is tiny (3×3 tracks): a second caption line
        // ("последний приём") used to overflow the centered flex container and overlap the
        // tile label above. The label «свежесть» already carries that meaning; overflow-hidden
        // is a belt-and-braces guard for extreme values.
        <div className="flex h-full flex-col justify-center overflow-hidden" style={mono}>
          <span data-testid="freshness-ago" style={{ color: "var(--text-primary)", fontSize: 13 }}>
            {formatAgo(at)}
          </span>
        </div>
      )}
    </TileShell>
  );
}
