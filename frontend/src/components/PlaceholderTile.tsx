import type { CSSProperties } from "react";
import { TileShell } from "./TileShell";

interface PlaceholderTileProps {
  label: string;
  /** The empty text (§7 Empty) — what will appear here in later eras. */
  note?: string;
  /** The sign tile (Identity) — render content rather than emptiness. */
  brand?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * An empty seam of the board (DESIGN §3 — empty slots are deliberate, not holes; §7 Empty). It
 * covers tiles of future eras: each lives in a warm emptiness and the board does not break.
 */
export function PlaceholderTile({ label, note, brand = false, style, className }: PlaceholderTileProps) {
  if (brand) {
    return (
      <TileShell state="loaded" ariaLabel={label} style={style} className={className}>
        <div className="flex h-full flex-col justify-center" style={{ fontFamily: "var(--font-mono)" }}>
          {/* The brand headline is the board's only display line: a wave may dress it in a chunky
              pixel face (§10.2) or leave it mono. The blinking caret follows the label. */}
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
            {label}
            <span className="pixel-caret" aria-hidden>
              ▮
            </span>
          </span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>дашборд жизни</span>
        </div>
      </TileShell>
    );
  }

  return (
    <TileShell
      state="empty"
      label={label}
      emptyText={note ?? "скоро"}
      muted
      ariaLabel={label}
      style={style}
      className={className}
    />
  );
}
