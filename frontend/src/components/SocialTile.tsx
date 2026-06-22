"use client";

import { useCallback, type CSSProperties } from "react";
import { getSocialLinks } from "@/lib/api/client";
import type { SocialLinkView } from "@/lib/api/types";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface SocialTileProps {
  style?: CSSProperties;
  className?: string;
}

/**
 * Плитка «Соцссылки» (L) — PRD §5.8, DESIGN §3. Иконка + название, всё гиперссылкой.
 * Пусто ⇒ тихий empty. Иконки — статика фронта (пиксель-иконка платформы).
 */
export function SocialTile({ style, className }: SocialTileProps) {
  const { phase, data, retry } = useTileData<SocialLinkView[]>(
    useCallback((signal) => getSocialLinks({ signal }), []),
    "social-links",
  );
  const links = data ?? [];
  const isEmpty = phase === "loaded" && links.length === 0;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет ссылок"
      onRetry={retry}
      label="соцсети"
      ariaLabel="Соцсети"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        <ul className="flex h-full flex-row flex-wrap content-center items-center justify-center gap-x-4 gap-y-2">
          {links.map((l, i) => (
            <li key={`${l.platform}-${i}`}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
                style={{ color: "var(--text-primary)", fontSize: 13 }}
              >
                {l.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.icon} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
                ) : (
                  <span
                    aria-hidden
                    style={{ width: 18, height: 18, flexShrink: 0, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }}
                  />
                )}
                <span className="truncate">{l.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </TileShell>
  );
}
