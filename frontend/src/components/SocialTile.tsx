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

/* Hand-colored pixel sprites for the wave-01 skin (frontend statics). The component only
   exposes both URLs via CSS vars on `.social-icon`; whether the colored sprite or the
   token-tinted mask is shown is the skin's call (wave-01.css / wave-02.css). Platforms
   without a sprite keep the mask on every wave. */
const WAVE01_SPRITES: Partial<Record<string, string>> = {
  github: "/assets/social/wave01/github.png",
  telegram: "/assets/social/wave01/telegram.png",
  instagram: "/assets/social/wave01/instagram.png",
  x: "/assets/social/wave01/x.png",
};

/**
 * Плитка «Соцсети» (L) — PRD §5.8. Квадратная сетка карточек-ссылок (иконка + название),
 * вместо прежней бегущей строки: все ссылки видны разом, ничего не мельтешит. Колонок
 * столько, чтобы сетка была квадратной (2×2 до 4 ссылок, 3×3 до 9, дальше 4×4). Спрайт —
 * статика фронта (`/assets/social/*.svg`), в базе красится токеном `--text-primary` через
 * CSS-маску (`.social-icon` в common.css), поэтому следует за активной волной (ноль
 * хардкод-цветов). Скин волны 01 подменяет маску цветным пиксель-спрайтом
 * (`.social-icon--sprite`, wave-01.css). Пусто ⇒ тихий empty.
 */
export function SocialTile({ style, className }: SocialTileProps) {
  const { phase, data, retry } = useTileData<SocialLinkView[]>(
    useCallback((signal) => getSocialLinks({ signal }), []),
    "social-links",
  );
  const links = data ?? [];
  const isEmpty = phase === "loaded" && links.length === 0;
  const cols = links.length <= 4 ? 2 : links.length <= 9 ? 3 : 4;

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
        <ul
          // social-grid: a container query in common.css hides the text labels when the tile
          // is too narrow for them — the grid degrades to recognizable icons only.
          className="social-grid grid h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: "minmax(0, 1fr)",
            gap: 10,
          }}
        >
          {links.map((l) => (
            <li key={l.platform} className="min-h-0 min-w-0">
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                aria-label={l.name}
                // social-card: the plate behind icon+label is a skin parameter (common.css) —
                // wave 01 clears it so sprites sit right on the tile surface.
                className="social-card flex h-full w-full flex-col items-center justify-center gap-2"
                style={{ color: "var(--text-primary)", fontSize: 12 }}
              >
                {l.icon ? (
                  <span
                    aria-hidden
                    className={`social-icon${WAVE01_SPRITES[l.platform] ? " social-icon--sprite" : ""}`}
                    style={
                      {
                        "--social-mask": `url(${l.icon})`,
                        ...(WAVE01_SPRITES[l.platform]
                          ? { "--social-sprite": `url(${WAVE01_SPRITES[l.platform]})` }
                          : {}),
                      } as CSSProperties
                    }
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                )}
                <span className="social-label max-w-full truncate px-1">{l.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </TileShell>
  );
}
