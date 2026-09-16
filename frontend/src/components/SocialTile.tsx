"use client";

import { useCallback, type CSSProperties } from "react";
import { getLatestInstagramPost, getSocialLinks, getTelegramProfile } from "@/lib/api/client";
import type { InstagramPostView, SocialLinkView, TelegramProfileView } from "@/lib/api/types";
import { HoverTip } from "./HoverTip";
import { InstagramPeek } from "./InstagramPeek";
import { TelegramPeek } from "./TelegramPeek";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface SocialTileProps {
  /**
   * The tile's edition. `peek` pops up what the platform itself shows under a mark; anything else,
   * including nothing, is a plain row of links. The WAVE decides through its layout delta rather
   * than code checking a wave key, or every new wave would need a component change. DESIGN §10.1
   */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

/* Hand-colored pixel sprites for the wave-01 skin (frontend statics). The component only exposes both
   URLs via CSS vars on `.social-icon`; whether the colored sprite or the token-tinted mask is shown
   is the skin's call. Platforms without a sprite keep the mask on every wave. */
const WAVE01_SPRITES: Partial<Record<string, string>> = {
  github: "/assets/social/wave01/github.png",
  telegram: "/assets/social/wave01/telegram.png",
  instagram: "/assets/social/wave01/instagram.png",
  x: "/assets/social/wave01/x.png",
};

/**
 * Platform brand marks as ORIGINALS, not redrawings, and vector rather than PNG: a mark lives both
 * in a 20px row and four times larger. GitHub and X use their WHITE variants, the official choice
 * for dark backgrounds. Painting them is the skin's business — zero hardcoded colours. §10.2
 */
const BRAND_MARKS: Partial<Record<string, string>> = {
  github: "/assets/social/brand/github.svg",
  telegram: "/assets/social/brand/telegram.svg",
  instagram: "/assets/social/brand/instagram.svg",
  x: "/assets/social/brand/x.svg",
};

/**
 * The social tile: a square grid of link cards instead of the old marquee, so everything is visible
 * at once and nothing flickers. Column count keeps the grid square. The sprite is a CSS mask
 * painted by a token, so it follows the active wave; a skin may swap in its own art. PRD §5.8
 */
export function SocialTile({ edition, style, className }: SocialTileProps) {
  const { phase, data, retry } = useTileData<SocialLinkView[]>(
    useCallback((signal) => getSocialLinks({ signal }), []),
    "social-links",
  );
  const links = data ?? [];
  const isEmpty = phase === "loaded" && links.length === 0;

  // Peeks are fetched only if the edition shows them — other waves make no requests at all. Empty
  // gives `null` and simply no card, leaving the mark an ordinary link. The sources are
  // independent: a silent Instagram does not cancel the Telegram card or the other way round.
  const peek = useTileData<InstagramPostView | null>(
    useCallback(
      (signal) => (edition === "peek" ? getLatestInstagramPost({ signal }) : Promise.resolve(null)),
      [edition],
    ),
    `instagram-latest-${edition ?? "plain"}`,
  );
  const post = edition === "peek" ? peek.data ?? null : null;

  const card = useTileData<TelegramProfileView | null>(
    useCallback(
      (signal) => (edition === "peek" ? getTelegramProfile({ signal }) : Promise.resolve(null)),
      [edition],
    ),
    `telegram-profile-${edition ?? "plain"}`,
  );
  const profile = edition === "peek" ? card.data ?? null : null;

  /** What rises under a mark. `undefined` ⇒ there is no hint at all and HoverTip renders a bare anchor. */
  const peekOf = (l: SocialLinkView) => {
    if (post && l.platform === "instagram") return <InstagramPeek post={post} />;
    if (profile && l.platform === "telegram") return <TelegramPeek profile={profile} href={l.url} />;
    return undefined;
  };
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
        // social-frame: the named container the grid computes its gap from. The wrapper is needed
        // apart from the grid because container-query units inside a container count from its PARENT,
        // so a grid cannot measure itself (common.css, DESIGN §8.1).
        <div className="tile-frame h-full">
          <ul
            // social-grid: a named container — the query in common.css hides the labels when the grid
            // is too narrow for text, leaving recognisable icons. Gap, icon and label are shares of
            // their containers rather than pixel constants (DESIGN §8.1).
            className="social-grid grid h-full"
            // Layout arrives as VARIABLES while the columns themselves are declared in CSS, the
            // same device as the music card's width: in the mobile stack the square grid becomes
            // ONE ROW, and inline `grid-template-columns` beats CSS unless it is `!important`.
            style={{ "--social-cols": cols, "--social-count": links.length } as CSSProperties}
          >
            {links.map((l) => (
              <li key={l.platform} className="min-h-0 min-w-0">
                <HoverTip fill content={peekOf(l)}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={l.name}
                  // social-card: the plate behind icon and label is a skin parameter (common.css) —
                  // wave 01 clears it so sprites sit right on the tile surface. A named container:
                  // icon, label and gap inside count from the card's width.
                  className="social-card flex h-full w-full flex-col items-center justify-center"
                  style={{ color: "var(--text-primary)" }}
                >
                  {l.icon ? (
                    <span
                      aria-hidden
                      className={`social-icon${WAVE01_SPRITES[l.platform] ? " social-icon--sprite" : ""}${
                        BRAND_MARKS[l.platform] ? " social-icon--brand" : ""
                      }`}
                      style={
                        {
                          "--social-mask": `url(${l.icon})`,
                          ...(WAVE01_SPRITES[l.platform]
                            ? { "--social-sprite": `url(${WAVE01_SPRITES[l.platform]})` }
                            : {}),
                          ...(BRAND_MARKS[l.platform]
                            ? { "--social-brand": `url(${BRAND_MARKS[l.platform]})` }
                            : {}),
                        } as CSSProperties
                      }
                    />
                  ) : (
                    // Placeholder for a platform without a sprite, at the same card share as an icon.
                    <span
                      aria-hidden
                      className="social-icon"
                      style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", mask: "none", WebkitMask: "none" }}
                    />
                  )}
                  <span className="social-label max-w-full truncate px-1">{l.name}</span>
                </a>
                </HoverTip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TileShell>
  );
}
