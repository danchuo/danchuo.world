"use client";

import { useState, type CSSProperties } from "react";
import { TileShell } from "./TileShell";

interface HeroTileProps {
  style?: CSSProperties;
  className?: string;
  /** Путь к hero-снимку (сид-ассет фронта, PRD §5.8). */
  src?: string;
}

/**
 * Плитка hero-фото (H) — PRD §5.8, DESIGN §3. Один избранный снимок в пиксель-рамке.
 * В v1 — статический сид-ассет (`/public/assets/hero/*`). Нет ассета (ошибка загрузки) ⇒
 * тихий empty, борд не ломается. (next/image тут не нужен — один декоративный кадр.)
 */
export function HeroTile({ style, className, src = "/assets/hero/hero.jpg" }: HeroTileProps) {
  const [broken, setBroken] = useState(false);

  return (
    <TileShell
      state={broken ? "empty" : "loaded"}
      emptyText="нет снимка"
      label="hero"
      ariaLabel="Избранное фото"
      style={style}
      className={className}
    >
      {!broken && (
        <div className="h-full w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Избранный снимок"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
            style={{ borderRadius: "var(--radius-sm)" }}
          />
        </div>
      )}
    </TileShell>
  );
}
