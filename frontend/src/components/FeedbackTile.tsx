"use client";

import { useState, type CSSProperties } from "react";
import { FeedbackModal } from "./FeedbackModal";
import { Icon } from "./Icon";
import { TileShell } from "./TileShell";

interface FeedbackTileProps {
  /** The active wave's key, carried into the note so a remark about colour stays readable. */
  wave?: string | null;
  /** The day the board has selected, carried into the note as the state it was written from. */
  selectedDay?: string | null;
  /** Which of the three faces the wave asks for — see [FACES]. */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Glyph, words, or both. The pairing is what needs choosing per wave: an envelope beside a line of
 * type reads well on one board and as clutter on another. DESIGN §7.11
 */
const FACES: Record<string, { glyph: boolean; call: string | null }> = {
  call: { glyph: true, call: "написать мне" },
  word: { glyph: false, call: "обратная связь" },
};
const GLYPH_ONLY = { glyph: true, call: null };

/**
 * The envelope: the only tile that asks rather than tells. It fetches nothing, so it is always
 * `loaded` — the per-tile state machine has nothing to say about a tile with no source.
 * PRD §5.19, DESIGN §7.11
 */
export function FeedbackTile({
  wave,
  selectedDay,
  edition,
  style,
  className,
}: FeedbackTileProps) {
  const [open, setOpen] = useState(false);
  const face = (edition && FACES[edition]) || GLYPH_ONLY;

  return (
    <>
      {/* The caption is rendered INSIDE the button rather than through TileShell's `label`, so the
          button can fill the whole tile: every pixel of it is the control. DESIGN §7.11 */}
      <TileShell
        state="loaded"
        ariaLabel="Написать автору"
        style={style}
        className={`t-feedback ${className ?? ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={face.call ?? "написать мне"}
          className="t-feedback__button tap-target"
          data-face={face.call ? "words" : "glyph"}
        >
          <span className="tile-label t-feedback__cap">обратная связь</span>
          <span className="t-feedback__body">
            {face.glyph && <Icon name="mail" size={26} className="t-feedback__glyph" />}
            {face.call && (
              <span className="t-feedback__call">
                {face.call}
                <span className="t-feedback__arrow" aria-hidden>
                  →
                </span>
              </span>
            )}
          </span>
        </button>
      </TileShell>

      {open && (
        <FeedbackModal
          waveKey={wave}
          selectedDay={selectedDay}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
