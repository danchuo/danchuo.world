"use client";

import { useMemo, type CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { buildRibbon } from "@/lib/waveRibbon";
import { WAVES } from "@/lib/waves";
import { TileShell } from "./TileShell";
import { useWave } from "./WaveProvider";

interface WaveSwitcherProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Direction of the chip row, set by the wave through layout (`tiles.waveSwitcher.orientation`), as
   * with `projects`, `photoDrops` and `marquee`. The default is a horizontal row.
   */
  orientation?: TileOrientation;
  /**
   * The calendar window, the material for the lived-days ribbon inside the cards (see the note below).
   * Optional: the switcher in the admin pulls no board data and lives without a ribbon.
   */
  summaries?: DaySummary[];
  /** The "today" anchor (MSK) for the ribbon: days after it do not travel into it. */
  today?: string;
}

/**
 * A wave's tokens into the inline `--chip-*` variables of its chip. The point: a chip is drawn in
 * the palette of THE WAVE IT OFFERS, not the active one, so values come from the wave's own tokens
 * rather than `:root`. Variables, not classes — a new wave previews itself the moment it exists. §2.6
 */
function chipVars(tokens: Record<string, string>): CSSProperties {
  const pick = (name: string, fallback: string) => tokens[name] ?? fallback;
  return {
    // A wave's page colour is its most recognisable trait (peach 01 against sky 02).
    "--chip-bg": pick("bg-page", "var(--bg-surface-muted)"),
    // The edge takes the same tokens as a real tile; a wave drawing its own overrides the chip's
    // shape in its skin. The `pixel-corners` silhouette does NOT travel here: it is set in absolute
    // px for a large tile and degenerates into a cross on a chip. CSS draws it at chip scale.
    ...(tokens["chip-corners"] ? { "--chip-corners": tokens["chip-corners"] } : {}),
    "--chip-line": pick("border-tile", "var(--border)"),
    "--chip-line-w": pick("tile-line", "1.5px"),
    // Rounding, for waves that draw their own edge (Obscura shapes its chip with it).
    "--chip-radius": pick("radius-sm", "6px"),
    // The wave's single signal colour, which paints the lower side of the chip's box.
    "--chip-accent": pick("accent", "var(--accent)"),
  } as CSSProperties;
}

/**
 * The wave switcher: a row of CHIPS, each a tiny card drawn in the edge and palette of its own
 * wave, with the active one raised like a real tile. A one-colour swatch showed a wave by one
 * token out of fifty — shape and accent read faster. Only released waves appear. DESIGN §2.6
 */
export function WaveSwitcher({
  style,
  className,
  orientation = "horizontal",
  summaries,
  today,
}: WaveSwitcherProps) {
  const vertical = orientation === "vertical";
  // The active wave and the swap come from context (the SSR default is the owner's active wave). A
  // swap changes both the tokens and the board's layout at once.
  const { activeKey, applyWave } = useWave();

  // The ribbon of lived days is the card's MATERIAL, not a caption: a wave whose backdrop is made
  // of data shows a piece of that backdrop in its chip. The seam sits in EVERY chip and is
  // wave-agnostic. An empty string removes the layer — a chip must stay a whole surface. §2.6
  const ribbon = useMemo(
    () => (summaries && today ? buildRibbon(summaries, today) : ""),
    [summaries, today],
  );

  return (
    <TileShell
      state="loaded"
      label="волны"
      ariaLabel="Переключатель волн"
      style={style}
      className={className}
    >
      {
        // `tile-frame` is required: without its own container the chip's `cqw` latches onto a
        // distant ancestor and hits the clamp ceiling. `flex-nowrap` is deliberate — browser zoom
        // shrinks the viewport, and wrapping silently stood the row up as a column.
        <div
          className={`wave-chip-row tile-frame flex h-full flex-nowrap content-center items-center gap-1.5 ${
            vertical ? "flex-col" : "flex-row"
          }`}
        >
          {WAVES.map((t) => {
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                type="button"
                className="wave-chip tap-target"
                // The wave key is the hook for a skin: a wave with its own edge shapes ITS OWN chip
                // while lying on another wave's board (see wave-02.css).
                data-chip-wave={t.key}
                data-active={isActive}
                aria-pressed={isActive}
                // `aria-label` stays, since to a screen reader an unlabelled chip is just "button",
                // but there is deliberately NO native tooltip: a wave's name says nothing to a
                // visitor, who chooses by eye, from the chip itself.
                aria-label={`Волна: ${t.name}`}
                onClick={() => applyWave(t)}
                style={chipVars(t.tokens)}
              >
                {/* Two layers only: the box's lower edge in the wave's signal colour, and the card
                    itself. A mini board inside the card was tried and dropped — a picture in a
                    picture. */}
                <span className="wave-chip__slab" aria-hidden />
                <span className="wave-chip__face" aria-hidden>
                  {/* The layer is aria-hidden itself although it sits inside a hidden card: the
                      material must not be read aloud even if the card's markup is reworked. */}
                  {ribbon && (
                    <span className="wave-chip__ribbon" aria-hidden>
                      {ribbon}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      }
    </TileShell>
  );
}
