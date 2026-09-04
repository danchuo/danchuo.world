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
        // social-frame: именованный контейнер, от которого сетка считает свой зазор. Обёртка
        // нужна отдельно от сетки: container-query-единицы внутри контейнера считаются от
        // ПРЕДКА, поэтому сетка не может мерить саму себя (common.css, DESIGN §8.1).
        <div className="tile-frame h-full">
          <ul
            // social-grid: именованный контейнер — запрос в common.css прячет подписи, когда сетка
            // слишком узка для текста, оставляя узнаваемые иконки. Зазор, иконка и подпись —
            // доли своих контейнеров, а не пиксельные константы (DESIGN §8.1).
            className="social-grid grid h-full"
            // Раскладка приезжает ПЕРЕМЕННЫМИ, а сами колонки объявлены в common.css — тот же
            // приём, что у ширины карточки музыки. Причина: в мобильном стеке квадратная сетка
            // становится ОДНИМ РЯДОМ (2×2 из крупных спрайтов съедало пол-экрана), а inline
            // `grid-template-columns` CSS не перебивает ничем, кроме `!important`.
            // `--social-count` едет отдельно от `--social-cols`: число ссылок из числа колонок
            // не вывести (3 колонки — это и 5 ссылок, и 9), а ряду нужно именно оно.
            style={{ "--social-cols": cols, "--social-count": links.length } as CSSProperties}
          >
            {links.map((l) => (
              <li key={l.platform} className="min-h-0 min-w-0">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={l.name}
                  // social-card: the plate behind icon+label is a skin parameter (common.css) —
                  // wave 01 clears it so sprites sit right on the tile surface. Именованный
                  // контейнер: иконка/подпись/зазор внутри считаются от ширины карточки.
                  className="social-card flex h-full w-full flex-col items-center justify-center"
                  style={{ color: "var(--text-primary)" }}
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
                    // Заглушка платформы без спрайта — той же доли карточки, что и иконка.
                    <span
                      aria-hidden
                      className="social-icon"
                      style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", mask: "none", WebkitMask: "none" }}
                    />
                  )}
                  <span className="social-label max-w-full truncate px-1">{l.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TileShell>
  );
}
