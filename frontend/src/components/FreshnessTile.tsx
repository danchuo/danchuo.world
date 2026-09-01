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
      /* Ярлык плитки — не слово, а 8-битный дозвон: компьютер, телефон и планета на проводе.
         Он про то же, что и сама плитка (данные доехали по проводам), и занимает ровно строку
         подписи. Слово никуда не делось: оно осталось именем картинки для скринридера, а
         подсказка волны (HoverTip) объясняет саму метрику, а не повторяет ярлык — иконка
         сама себя не объясняет, а «свежесть — это свежесть» ничего не добавляет. */
      label={
        <HoverTip phrase text="время, когда последний раз обновлялись данные">
          <span data-testid="freshness-dialup" className="t-fresh-dialup" role="img" aria-label="свежесть" />
        </HoverTip>
      }
      ariaLabel="Свежесть данных"
      // Плитка крошечная (3 кол.) — базовый кегль гасим классом (.t-fresh), чтобы
      // empty/error-текст влезал; сам кегль — доля плитки, не пиксель (DESIGN §8.1).
      style={style}
      className={`t-fresh ${className ?? ""}`}
    >
      {phase === "loaded" && at !== null && (
        // Single "N назад" line only. The tile is tiny (3×3 tracks): a second caption line
        // ("последний приём") used to overflow the centered flex container and overlap the
        // tile label above. The label «свежесть» already carries that meaning; overflow-hidden
        // is a belt-and-braces guard for extreme values.
        <div className="tile-frame flex h-full flex-col justify-center overflow-hidden" style={mono}>
          <span data-testid="freshness-ago" className="t-fresh-ago" style={{ color: "var(--text-primary)" }}>
            {formatAgo(at)}
          </span>
        </div>
      )}
    </TileShell>
  );
}
