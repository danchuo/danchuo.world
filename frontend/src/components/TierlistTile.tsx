"use client";

import { useState, type CSSProperties } from "react";
import { TIER_LABEL, TIERS } from "@/lib/tierlist";
import { TierlistModal } from "./TierlistModal";
import { TileShell } from "./TileShell";

interface TierlistTileProps {
  style?: CSSProperties;
  className?: string;
}

/**
 * The shirt tier list's door: a miniature ladder beside words saying it ranks shirts, and the whole
 * cell is the button. It fetches nothing, so it is always `loaded`. PRD §5.20, DESIGN §7.12
 */
export function TierlistTile({ style, className }: TierlistTileProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TileShell
        state="loaded"
        ariaLabel="Тирлист футболок"
        style={style}
        className={`tile-frame t-tierlist ${className ?? ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="t-tierlist__button tap-target"
        >
          <span className="t-tierlist__ladder" aria-hidden>
            {TIERS.map((tier) => (
              <span key={tier} className="t-tierlist__rung" data-tier={tier}>
                {TIER_LABEL[tier]}
              </span>
            ))}
          </span>
          <span className="t-tierlist__words">
            <span className="t-tierlist__title">тирлист футболок</span>
            <span className="t-tierlist__lead">
              расставь <span aria-hidden>→</span>
            </span>
          </span>
        </button>
      </TileShell>

      {open && <TierlistModal onClose={() => setOpen(false)} />}
    </>
  );
}
