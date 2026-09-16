"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getRides } from "@/lib/api/client";
import type { RideView } from "@/lib/api/types";
import { mskToday } from "@/lib/date";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm } from "@/lib/rideFormat";
import { RideMap } from "./RideMap";
import { RidesModal } from "./RidesModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

/**
 * Editions of the widget, chosen by the WAVE through its layout; an unknown value falls back to
 * `card`. `card` is a dossier with a mini-map above the figures, `map` is a full-tile map with the
 * data lying on it. The edition is SHARED with the modal — two sides of one widget. DESIGN §10.1
 */
export type RideEdition = "card" | "map";

interface RideTileProps {
  /** The active wave, passed into the mini-map to pick the pixel pins (DESIGN §12). */
  wave?: string | null;
  /** Edition from the wave's layout (taken as a string and validated here). */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

function resolveEdition(value: string | undefined): RideEdition {
  return value === "map" ? "map" : "card";
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * The latest Velobike ride. There are only two geo points, and both editions show them on a map;
 * they differ in what surrounds it. Both lead to the same modal, which inherits the edition.
 * Empty until the first ingest is a quiet empty, and there are no hardcoded colours. DESIGN §7.6
 */
export function RideTile({ wave, edition: editionRaw, style, className }: RideTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, retry } = useTileData<RideView[]>(
    useCallback((signal) => getRides({ signal }), []),
    "rides",
  );
  const [modalOpen, setModalOpen] = useState(false);
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

  /**
   * Whether the map's first tiles arrived. The tile waits for the map and appears WITH it, hidden
   * by OPACITY rather than unmounting — the map must be in the markup to start loading at all.
   * Readiness remembers WHICH WAVE's map was shown, since [RideMap] rebuilds on a wave change.
   */
  const [readyWave, setReadyWave] = useState<string | null>(null);
  const waveKey = wave ?? "";
  const mapReady = readyWave === waveKey;

  /**
   * The data band's height, MEASURED rather than written as a number: CSS owns it, and the map
   * must lift the route out from under exactly what the band took. The node lives in state via a
   * callback ref — the band appears AFTER the network answer, so a phase-keyed measure misses it.
   */
  const [bandEl, setBandEl] = useState<HTMLElement | null>(null);
  const [bandH, setBandH] = useState(0);
  useEffect(() => {
    if (!bandEl) return;
    const measure = () => setBandH(bandEl.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom tests have no ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(bandEl);
    return () => ro.disconnect();
  }, [bandEl]);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="поездок пока нет"
        onRetry={retry}
        label="велобайк"
        ariaLabel="Последняя поездка на Велобайке"
        style={style}
        className={`${edition === "map" ? "ride-card--map" : ""}${
          edition === "map" && (mapReady || !hasCoords) ? " is-ready" : ""
        } ${className ?? ""}`}
      >
      {phase === "loaded" && !isEmpty && latest && edition === "map" && (
        // A full-tile map with the data as a blurred band ON it, the same thought as the drop
        // tile's caption band: this widget has no margins and no second column — the map is its
        // whole subject. The entire tile is one button, so "previous" needs no row of its own.
        <button
          ref={mapCardRef}
          type="button"
          onClick={() => setModalOpen(true)}
          className="ride-frame"
          aria-label="Открыть карту поездок"
        >
          {hasCoords ? (
            <RideMap
              className="ride-frame__map"
              startLat={latest.startLat!}
              startLon={latest.startLon!}
              finishLat={latest.finishLat!}
              finishLon={latest.finishLon!}
              wave={wave}
              padTop={bandH}
              onReady={() => setReadyWave(waveKey)}
            />
          ) : (
            <span className="ride-frame__map" style={{ background: "var(--bg-surface-muted)" }} aria-hidden />
          )}
          {/* The strip's blur is TWO `backdrop-filter` passes across the whole tile, masked open
              only at the top. Full height is deliberate: the sampling clamps at its own box's
              edges, and a strip its own height would smear along the bottom (docs/pitfalls.md). */}
          <span className="ride-frame__blur ride-frame__blur--soft" aria-hidden />
          <span className="ride-frame__blur ride-frame__blur--deep" aria-hidden />
          {/* The caption is ONE line, by the same device as a drop frame's (`.drop-frame__caption`):
              the big thing left, the rest in small mono beside it. The kinship is not cosmetic —
              both strips lie on progressive blur over someone else's picture, side by side. */}
          <span ref={setBandEl} className="ride-frame__band">
            <span className="ride-frame__caption">
              <span className="ride-frame__km">{formatKm(latest.distanceMeters)}</span>
              <span className="ride-frame__meta">
                {relativeDayRu(latest.rideDate, today)} · {formatDuration(latest.durationSeconds)}
              </span>
            </span>
          </span>
        </button>
      )}

      {phase === "loaded" && !isEmpty && latest && edition === "card" && (
        <div className="tile-frame flex h-full flex-col gap-2">
          {hasCoords && (
            // A click on the map opens the rides modal (the map is static with pointer-events: none,
            // so clicks reach the button). The same entry point as "previous rides".
            <button
              ref={mapCardRef}
              type="button"
              onClick={() => setModalOpen(true)}
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
                  onClick={() => setModalOpen(true)}
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
          edition={editionRaw}
          // The tile's map is what the modal's map grows from (DESIGN §7.5). The ref is always given:
          // whether the transition plays is decided by the wave's skin, not by the edition.
          origin={mapCardRef}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
