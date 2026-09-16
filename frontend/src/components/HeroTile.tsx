"use client";

import { useState, type CSSProperties } from "react";
import { TileShell } from "./TileShell";

interface HeroTileProps {
  style?: CSSProperties;
  className?: string;
  /** Path to the hero shot (a seeded frontend asset, PRD §5.8). */
  src?: string;
}

/**
 * The hero photo tile: one chosen shot in a pixel frame. In v1 it is a static seed asset; a missing
 * one degrades to a quiet empty and the board holds. `next/image` is unnecessary for one
 * decorative frame. PRD §5.8, DESIGN §3
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
