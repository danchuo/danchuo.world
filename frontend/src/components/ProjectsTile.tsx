"use client";

import { useCallback, type CSSProperties } from "react";
import { getProjects } from "@/lib/api/client";
import type { ProjectView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { formatQuarterRange } from "@/lib/projectRange";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ProjectsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Направление списка — задаётся волной через layout (`tiles.projects.orientation`,
   * как у marquee и полки дропов). Дефолт — вертикальная колонка.
   */
  orientation?: TileOrientation;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

// Project "planet" sprites are wave-agnostic art served from our own static assets
// (DESIGN §12.2): rendered in a bigger unrounded slot, same on every wave. External
// favicons (any other origin/path) keep the legacy small rounded treatment. The "-px"
// filename suffix marks true pixel art that must scale with nearest-neighbor: smooth
// flat sprites (e.g. proxemics) fall apart when pixelated at 28px. Smooth sprites get
// a one-step bigger slot (32 vs 28): without a chunky pixel outline they optically
// read smaller than pixel art of the same box.
const isPlanetSprite = (url: string) => url.startsWith("/assets/projects/");
const isPixelArt = (url: string) => url.endsWith("-px.png");
const spriteSize = (url: string) => (isPixelArt(url) ? 28 : 32);

/**
 * Плитка «Проекты» (P) — PRD §5.7, DESIGN §3. Свёрнутый блок: иконка + название (ссылкой,
 * если задан url) + диапазон кварталов. Пусто ⇒ тихий empty. Ноль хардкод-цветов (токены волны).
 */
export function ProjectsTile({ style, className, orientation = "vertical" }: ProjectsTileProps) {
  const { phase, data, retry } = useTileData<ProjectView[]>(
    useCallback((signal) => getProjects({ signal }), []),
    "projects",
  );
  const projects = data ?? [];
  const isEmpty = phase === "loaded" && projects.length === 0;
  const horizontal = orientation === "horizontal";

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет проектов"
      onRetry={retry}
      label="проекты"
      ariaLabel="Проекты"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        <ul
          className={
            horizontal
              ? "projects-list--horizontal flex h-full flex-row items-center gap-4 overflow-x-auto"
              : "flex h-full flex-col gap-2 overflow-y-auto"
          }
        >
          {projects.map((p) => (
            <li
              key={p.title}
              className={horizontal ? "flex shrink-0 flex-col items-center gap-1" : "flex items-center gap-2"}
            >
              {p.iconUrl ? (
                isPlanetSprite(p.iconUrl) ? (
                  // Uniform 32px icon column: sprites of different sizes (28 pixel / 32
                  // smooth) center inside it, so row texts start at the same x.
                  <span aria-hidden className="grid shrink-0 place-items-center" style={{ width: 32, height: 32 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.iconUrl}
                      alt=""
                      width={spriteSize(p.iconUrl)}
                      height={spriteSize(p.iconUrl)}
                      style={isPixelArt(p.iconUrl) ? { imageRendering: "pixelated" } : undefined}
                    />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.iconUrl}
                    alt=""
                    width={20}
                    height={20}
                    style={{ flexShrink: 0, borderRadius: "var(--radius-sm)" }}
                  />
                )
              ) : (
                <span
                  aria-hidden
                  style={{ width: 20, height: 20, flexShrink: 0, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }}
                />
              )}
              <div className={horizontal ? "flex min-w-0 flex-col items-center text-center" : "flex min-w-0 flex-col"}>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate"
                    style={{ color: "var(--text-primary)", fontSize: 13 }}
                  >
                    {p.title}
                  </a>
                ) : (
                  <span className="truncate" style={{ color: "var(--text-primary)", fontSize: 13 }}>
                    {p.title}
                  </span>
                )}
                <span style={{ ...mono, color: "var(--text-tertiary)", fontSize: 11 }}>
                  {formatQuarterRange(p.startYear, p.startQuarter, p.endYear, p.endQuarter)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TileShell>
  );
}
