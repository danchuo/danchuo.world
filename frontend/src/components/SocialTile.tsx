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
 * Плитка «Соцсети» (L) — PRD §5.8, DESIGN §3. Спрайт-иконка + название, всё гиперссылкой.
 * Ссылок больше, чем влезает в ряд → бесконечная бегущая строка (как marquee артефактов §7.2):
 * дублируем список и едем на -50% (петля бесшовна), пауза на ховер, reduced-motion замирает
 * глобально. Спрайт — статика фронта (`/assets/social/*.svg`), красится токеном `--text-primary`
 * через CSS-маску, поэтому следует за активной волной (ноль хардкод-цветов). Пусто ⇒ тихий empty.
 */
export function SocialTile({ style, className }: SocialTileProps) {
  const { phase, data, retry } = useTileData<SocialLinkView[]>(
    useCallback((signal) => getSocialLinks({ signal }), []),
    "social-links",
  );
  const links = data ?? [];
  const isEmpty = phase === "loaded" && links.length === 0;
  // Темп по числу ссылок, не быстрее 24с — читаемо, не мельтешит.
  const duration = `${Math.max(24, links.length * 7)}s`;

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
        <div className="relative flex h-full items-center overflow-hidden">
          <div className="artifact-track" style={{ "--artifact-duration": duration } as CSSProperties}>
            {/* Дублируем список дважды — петля -50% бесшовна. Второй проход aria-hidden. */}
            {[...links, ...links].map((l, i) => {
              const dup = i >= links.length;
              return (
                <a
                  key={`${l.platform}-${i}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-hidden={dup || undefined}
                  tabIndex={dup ? -1 : 0}
                  className="mx-4 inline-flex items-center gap-2 align-middle"
                  style={{ color: "var(--text-primary)", fontSize: 13 }}
                >
                  {l.icon ? (
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        flexShrink: 0,
                        background: "var(--text-primary)",
                        WebkitMaskImage: `url(${l.icon})`,
                        maskImage: `url(${l.icon})`,
                        WebkitMaskRepeat: "no-repeat",
                        maskRepeat: "no-repeat",
                        WebkitMaskSize: "contain",
                        maskSize: "contain",
                        WebkitMaskPosition: "center",
                        maskPosition: "center",
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        flexShrink: 0,
                        background: "var(--bg-surface-muted)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    />
                  )}
                  <span className="whitespace-nowrap">{l.name}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </TileShell>
  );
}
