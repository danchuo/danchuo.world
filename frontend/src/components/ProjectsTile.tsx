"use client";

import { useCallback, type CSSProperties } from "react";
import { getProjects } from "@/lib/api/client";
import type { ProjectView } from "@/lib/api/types";
import { formatQuarterRange } from "@/lib/projectRange";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ProjectsTileProps {
  style?: CSSProperties;
  className?: string;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Плитка «Проекты» (P) — PRD §5.7, DESIGN §3. Свёрнутый блок: иконка + название (ссылкой,
 * если задан url) + диапазон кварталов. Пусто ⇒ тихий empty. Ноль хардкод-цветов (токены волны).
 */
export function ProjectsTile({ style, className }: ProjectsTileProps) {
  const { phase, data, retry } = useTileData<ProjectView[]>(
    useCallback((signal) => getProjects({ signal }), []),
    "projects",
  );
  const projects = data ?? [];
  const isEmpty = phase === "loaded" && projects.length === 0;

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
        <ul className="flex h-full flex-col gap-2 overflow-y-auto">
          {projects.map((p, i) => (
            <li key={`${p.title}-${i}`} className="flex items-center gap-2">
              {p.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.iconUrl}
                  alt=""
                  width={20}
                  height={20}
                  style={{ flexShrink: 0, borderRadius: "var(--radius-sm)" }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{ width: 20, height: 20, flexShrink: 0, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }}
                />
              )}
              <div className="flex min-w-0 flex-col">
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
