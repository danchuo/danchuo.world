"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { getRides } from "@/lib/api/client";
import type { RideView } from "@/lib/api/types";
import { mskToday } from "@/lib/date";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm } from "@/lib/rideFormat";
import { RideMap } from "./RideMap";
import { RidesModal } from "./RidesModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface RideTileProps {
  /** The active wave, passed into the mini-map to pick the pixel pins (DESIGN §12). */
  wave?: string | null;
  style?: CSSProperties;
  className?: string;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * The map's current frame as a data URL, or null. It exists only because RideMap keeps its drawing
 * buffer; a tainted or absent canvas simply means the flight waits for the window's own map.
 */
function snapshotMap(host: HTMLElement | null): string | null {
  const canvas = host?.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * The latest Velobike ride: a mini-map of its two geo points above the figures, leading into the
 * rides modal. Empty until the first ingest is a quiet empty, and there are no hardcoded colours.
 * DESIGN §7.6
 */
export function RideTile({ wave, style, className }: RideTileProps) {
  const { phase, data, retry } = useTileData<RideView[]>(
    useCallback((signal) => getRides({ signal }), []),
    "rides",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const openModal = () => {
    setPreview(snapshotMap(mapCardRef.current));
    setModalOpen(true);
  };
  const today = mskToday();
  const rides = data ?? [];
  const latest = rides[0];
  const isEmpty = phase === "loaded" && rides.length === 0;

  const hasCoords =
    latest?.startLat != null &&
    latest?.startLon != null &&
    latest?.finishLat != null &&
    latest?.finishLon != null;

  /**
   * The map on the tile is the source of the develop transition (DESIGN §7.5): the modal's map grows
   * out of it. A ref rather than a rectangle, since it has to be measured on opening and on closing.
   */
  const mapCardRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="поездок пока нет"
        onRetry={retry}
        label="велобайк"
        ariaLabel="Последняя поездка на Велобайке"
        style={style}
        className={className}
      >
      {phase === "loaded" && !isEmpty && latest && (
        <div className="tile-frame flex h-full flex-col gap-2">
          {hasCoords && (
            // A click on the map opens the rides modal (the map is static with pointer-events: none,
            // so clicks reach the button). The same entry point as "previous rides".
            <button
              ref={mapCardRef}
              type="button"
              onClick={openModal}
              aria-label="Открыть карту поездок"
              // The box's geometry lives in `.ride-map-box`: in bento it is a share of tile height,
              // while in the stack (DESIGN §8) there is none, and the map initialised into zero height.
              className="ride-map-box tap-target"
              style={{
                overflow: "hidden",
                borderRadius: "var(--radius-sm)",
                border: "none",
                padding: 0,
                background: "none",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              <RideMap
                startLat={latest.startLat!}
                startLon={latest.startLon!}
                finishLat={latest.finishLat!}
                finishLon={latest.finishLon!}
                wave={wave}
              />
            </button>
          )}

          <div className="flex flex-col gap-1">
            {/* "When" on the left, "previous" flush right on the same line. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-ride-when" style={{ color: "var(--text-secondary)" }}>{relativeDayRu(latest.rideDate, today)}</span>
              {rides.length > 1 && (
                <button
                  type="button"
                  onClick={openModal}
                  aria-label="Предыдущие поездки"
                  className="tap-target t-ride-more shrink-0 cursor-pointer"
                  style={{ ...mono, color: "var(--accent)", background: "none", border: "none" }}
                >
                  предыдущие
                </button>
              )}
            </div>

            {/* Figures on the tile: distance (large) left, duration (slightly smaller) flush right
                so the right side is not empty. Calories stay in the modal's list rows only. */}
            <div className="flex items-baseline justify-between gap-x-2" style={{ ...mono, color: "var(--text-primary)" }}>
              <span className="t-ride-km" style={{ lineHeight: 1 }}>{formatKm(latest.distanceMeters)}</span>
              <span className="t-ride-dur" style={{ color: "var(--text-secondary)" }}>{formatDuration(latest.durationSeconds)}</span>
            </div>

          </div>
        </div>
      )}
      </TileShell>

      {/* The modal is a sibling of TileShell, not inside it: `.pixel-tile`'s clip-path and shadow
          create a containing block, and a fixed overlay inside the tile would be clipped by it
          instead of the viewport. The same device as the photo drops' (§7.5). */}
      {modalOpen && (
        <RidesModal
          rides={rides}
          today={today}
          wave={wave}
          // The tile's map is what the modal's map grows from (DESIGN §7.5); whether the transition
          // plays is decided by the wave's skin.
          origin={mapCardRef}
          preview={preview}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
