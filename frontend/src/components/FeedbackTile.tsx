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
interface Face {
  glyph: boolean;
  call: string | null;
  intro?: boolean;
}

const FACES: Record<string, Face> = {
  call: { glyph: true, call: "написать мне" },
  word: { glyph: false, call: "обратная связь" },
  // What the board is, for a visitor meeting it cold, over the call. PRD §5.19
  intro: { glyph: false, call: "обратная связь", intro: true },
};
const GLYPH_ONLY: Face = { glyph: true, call: null };

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
        fluid={face.intro}
        style={style}
        className={`t-feedback${face.intro ? " t-feedback--intro" : ""} ${className ?? ""}`}
      >
        {face.intro && (
          <div className="t-feedback__intro">
            {/* The page's only `h1`: without it the board had no heading at all. */}
            <h1 className="t-feedback__title">
              danchuo.world
              <span className="t-feedback__caret" aria-hidden />
            </h1>
            <p className="t-feedback__text">
              дашборд для поддержания дисциплины со всяким, советую повыбирать и другие дни в календаре на
              изучение
            </p>
          </div>
        )}
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
