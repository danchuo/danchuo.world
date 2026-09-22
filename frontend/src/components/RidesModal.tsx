"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { getRideMonthSummary } from "@/lib/api/client";
import type { RideMonthSummaryView, RideView } from "@/lib/api/types";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm, formatRideCost, formatStationAddress, pluralRu, rublesWhole } from "@/lib/rideFormat";
import { Icon } from "./Icon";
import { RideMap } from "./RideMap";
import { useBackToClose } from "./useBackToClose";
import { useDropMorph } from "./useDropMorph";

interface RidesModalProps {
  rides: RideView[];
  today: string;
  /** The active wave, passed into the map to pick the pixel pins (DESIGN §12). */
  wave?: string | null;
  /**
   * Widget edition (see `RideEdition` in [RideTile]): `map` unfolds the window into a spread — map
   * left, list right — and anything else keeps the former column. Taken as a string.
   */
  edition?: string;
  /**
   * The board tile's map, which the window's map grows from (develop transition, DESIGN §7.5).
   * Whether the movement plays is decided by the wave's skin (`--drop-morph`); only the source is here.
   */
  origin?: RefObject<HTMLElement | null>;
  /**
   * The tile map's frame as an image URL, flown as the hero until the window's own map has tiles.
   * Without it the flight waits for the map and usually misses the seam's wait cap. DESIGN §7.6
   */
  preview?: string | null;
  onClose: () => void;
}

const hasCoords = (r: RideView | undefined): r is RideView =>
  !!r && r.startLat != null && r.startLon != null && r.finishLat != null && r.finishLon != null;

/**
 * The Velobike rides modal, the same shape as the photo-drop one: the selected ride's map, a
 * selectable list and a month summary. The `map` edition lays those three as a SPREAD, because in
 * that edition the tile is all map and a narrow strip above a list would read as a step back.
 */
export function RidesModal({ rides, today, wave, edition, origin, preview, onClose }: RidesModalProps) {
  const spread = edition === "map";
  const sceneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(rides[0]?.id ?? null);
  const [summary, setSummary] = useState<RideMonthSummaryView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const selected = useMemo(
    () => rides.find((r) => r.id === selectedId) ?? rides[0],
    [rides, selectedId],
  );
  // The snapshot shows the tile's ride, the freshest one, so another selection drops it at once.
  const shot = preview && selected?.id === rides[0]?.id && hasCoords(selected) ? preview : null;

  // Current month's summary (the header under the map), fetched lazily on opening; a failure is
  // swallowed, the line being secondary. The money is computed by the backend with tariff purchases
  // deduplicated, which the frontend cannot reconstruct (see `RideMonthSummaryView`).
  useEffect(() => {
    const ctrl = new AbortController();
    getRideMonthSummary({ signal: ctrl.signal }).then(setSummary).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const showSummary = summary != null && summary.rides > 0;
  const summaryMinutes = summary ? Math.round(summary.durationSeconds / 60) : 0;
  const summaryRubles = summary ? rublesWhole(summary.spentKopecks) : 0;

  // Develop transition: the map grows out of the board tile (DESIGN §7.5). The seam is shared with the
  // drop gallery and switched on by the wave, so no wave key or animation number lives here.
  const { playIn, requestClose } = useDropMorph({ origin, sceneRef, onClose });
  // Played once the map has something to show: the tiles have arrived, or there is nothing to show at
  // all (a ride without coordinates gets a placeholder). A layout effect, as in the gallery — the
  // transform must land BEFORE the window's first paint.
  useLayoutEffect(() => {
    if (shot || mapReady || !hasCoords(selected)) playIn();
  }, [shot, mapReady, selected, playIn]);

  // The system Back closes the window rather than leaving the site (DESIGN §9).
  useBackToClose(true, requestClose);

  // Is the list scrolled to the end? The bottom row's fade depends on it, and "it all fits" counts
  // as true so no fade appears. Recomputed on scroll AND on column resize: the spread reaches its
  // real size only after opening, so a measurement on mount is not final.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    if (typeof ResizeObserver === "undefined") return () => el.removeEventListener("scroll", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [rides]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // The selected ride's map. THE SAME NODE in both editions — only where it is placed changes. It
  // is also the develop transition's hero and its face, the layer clipped during the flight; for a
  // drop the face is the photo, here it is the map itself.
  const map = (
    <div
      className={spread ? "ride-modal__map" : "shrink-0"}
      data-morph-hero
      data-morph-face
      style={
        spread
          ? undefined
          : { position: "relative", height: "var(--modal-map-h)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: 10 }
      }
    >
      {hasCoords(selected) ? (
        <RideMap
          key={selected.id}
          startLat={selected.startLat!}
          startLon={selected.startLon!}
          finishLat={selected.finishLat!}
          finishLon={selected.finishLon!}
          wave={wave}
          interactivePins
          startLabel={formatStationAddress(selected.startAddress)}
          finishLabel={formatStationAddress(selected.finishAddress)}
          onReady={() => setMapReady(true)}
        />
      ) : (
        <div
          className="flex h-full items-center justify-center"
          style={{ ...monoTertiary, background: "var(--bg-surface-muted)" }}
        >
          нет данных о маршруте
        </div>
      )}
      {/* Contained, the sharp copy fills exactly the flight's starting clip, so take-off matches the
          tile; the blurred cover copy fills the sides the clip opens onto. */}
      {shot && (
        <span className={`ride-modal__shot${mapReady ? " is-gone" : ""}`} aria-hidden>
          <img className="ride-modal__preview ride-modal__preview--fill" src={shot} alt="" />
          <img className="ride-modal__preview" src={shot} alt="" />
        </span>
      )}
    </div>
  );

  /* Current month's summary as a quiet one-line caption that does not scroll with the list. Unobtrusive:
     no plate or border, muted mono, with the figures a little brighter than the units. No rides this
     month ⇒ no line at all. */
  const summaryLine = showSummary && (
    <div
      className="ride-modal__summary shrink-0 flex flex-wrap items-baseline"
      style={summaryRow}
      aria-label="Сводка за текущий месяц"
    >
      <span style={summaryCaption}>в этом месяце</span>
      <SummaryStat value={summary.rides} unit={pluralRu(summary.rides, ["поездка", "поездки", "поездок"])} />
      <span style={summaryDot}>·</span>
      <SummaryStat value={summaryMinutes} unit={pluralRu(summaryMinutes, ["минута", "минуты", "минут"])} />
      <span style={summaryDot}>·</span>
      <SummaryStat value={summaryRubles} unit={pluralRu(summaryRubles, ["рубль", "рубля", "рублей"])} />
    </div>
  );

  /**
   * The SELECTED ride's figures in the spread's header, in place of the word "rides": the header
   * answers "how much" and the list "when and where". While the figures sat in every list row,
   * both answers shared one column and it shimmered. Spread only — a column has nowhere else.
   */
  const headline = selected && (
    <div className="ride-modal__headline flex min-w-0 flex-wrap items-baseline">
      <span className="ride-modal__headline-km">{formatKm(selected.distanceMeters)}</span>
      <span className="ride-modal__headline-meta">
        {formatDuration(selected.durationSeconds)}
        {selected.calories != null && selected.calories > 0 ? ` · ${selected.calories} ккал` : ""}
        {formatRideCost(selected) ? ` · ${formatRideCost(selected)}` : ""}
      </span>
    </div>
  );

  /* Scrollable list: a row is a selection button, the selected one highlighted. In the spread the
     scrollbar is removed and the bottom row dissolves under the column's edge instead (`--fade`,
     common.css) — the knowledge that the list is longer than the window has to survive its removal. */

  /* Row structure in the spread: day name, its kilometres beside it, the date small on the right, and
     the stations below. Kilometres are the ONLY figure repeated from the header, because "how far" is
     the first question asked of someone else's row. */

  /* Time, calories and money stay in the header by the map: all of them at once made the list read as
     a table of equally loud rows. In the column layout the figures stay in the row, there being no
     other header there. */

  /* A spread row is a third smaller than a column one (`--ride-row-scale`): the column's width went to
     the map, and text at the former size would live there entirely in ellipses. */
  const list = (
    <ul
      ref={listRef}
      className={`ride-modal__list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto ${
        spread ? `scroll-invisible ride-modal__list--fade ${atEnd ? "is-at-end" : ""}` : ""
      }`}
      role="listbox"
      aria-label="Выбор поездки"
    >
      {rides.map((r) => {
        const isSel = r.id === selected.id;
        const cost = formatRideCost(r); // "406 ₽ (access 399 + 7 over)" and other shapes
        return (
          <li key={r.id} role="option" aria-selected={isSel}>
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`ride-modal__row tap-target flex w-full flex-col gap-1 text-left ${
                isSel ? "is-selected" : ""
              }`}
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                {/* The day's name and the kilometres are ONE group on the left: they are about one
                    ride and read in sequence. The date holds the row's right edge, and the space
                    between is given up by the name — the only part of variable length. */}
                <span className="ride-modal__when flex min-w-0 items-baseline">
                  <span
                    className="ride-modal__day"
                    style={{ color: isSel ? "var(--accent)" : "var(--text-primary)" }}
                  >
                    {relativeDayRu(r.rideDate, today)}
                  </span>
                  {spread && <span className="ride-modal__row-km">{formatKm(r.distanceMeters)}</span>}
                </span>
                <span className="ride-modal__date shrink-0">{r.rideDate}</span>
              </div>
              {!spread && (
                <div style={{ ...mono, color: "var(--text-secondary)", fontSize: "var(--fs-modal-meta)" }}>
                  {formatKm(r.distanceMeters)} · {formatDuration(r.durationSeconds)}
                  {r.calories != null && r.calories > 0 ? ` · ${r.calories} ккал` : ""}
                  {cost ? ` · ${cost}` : ""}
                </div>
              )}
              {(r.startAddress || r.finishAddress) &&
                (spread ? (
                  /* Two stations on TWO lines, each a single line with an ellipsis. On one line a long
                     pair wrapped differently for every ride and the list went in ragged blocks of
                     different heights, with nothing for the eye to search by. */
                  <div className="ride-modal__stations">
                    <span className="ride-modal__station">{formatStationAddress(r.startAddress) ?? "?"}</span>
                    <span className="ride-modal__station">
                      <span className="ride-modal__arrow" aria-hidden>
                        →{" "}
                      </span>
                      {formatStationAddress(r.finishAddress) ?? "?"}
                    </span>
                  </div>
                ) : (
                  <div style={{ ...mono, color: "var(--text-tertiary)", fontSize: "var(--fs-modal-note)" }}>
                    {(formatStationAddress(r.startAddress) ?? "?") +
                      " → " +
                      (formatStationAddress(r.finishAddress) ?? "?")}
                  </div>
                ))}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    // `drop-scene` is the develop transition's SCENE, not "the drop's layer": the scrim, the motion
    // timings and the wave's screen glass all live on it. The name stayed from its first tenant,
    // as did the whole seam's vocabulary; a second tenant moves in rather than building beside it.
    <div
      ref={sceneRef}
      className="drop-scene modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Прошлые поездки"
        className={`ride-modal__panel pixel-tile flex w-full flex-col p-4 ${spread ? "max-w-[64rem]" : "max-w-2xl"}`}
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The box backing plus the white inner frame (§2.4), as in TileShell: the modal panel
            carries .pixel-tile itself, so the layer elements are added here. */}
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />
        <div className="ride-modal__head mb-3 flex shrink-0 items-center justify-between gap-3">
          {spread && headline ? (
            headline
          ) : (
            <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>поездки</span>
          )}
          <button
            ref={closeRef}
            type="button"
            className="tap-target"
            onClick={requestClose}
            aria-label="Закрыть"
            style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {rides.length === 0 ? (
          <p style={monoTertiary}>поездок пока нет</p>
        ) : spread ? (
          <>
            {/* The spread: map left, list right, both halves shrinking with the window, with the
                summary as a full-width row beneath them. */}
            <div className="ride-modal__body flex min-h-0 flex-1">
              {/* The map and its button are one column: the button acts on the map and must stand
                  with it rather than drift under the list. */}
              <div className="ride-modal__mapcol flex min-h-0 flex-col">{map}</div>
              {list}
            </div>
            {summaryLine}
          </>
        ) : (
          <>
            {map}
            {summaryLine}
            {list}
          </>
        )}
      </div>
    </div>
  );
}

/** One month-summary figure as a line: the number (slightly brighter) plus its inflected unit (muted). */
function SummaryStat({ value, unit }: { value: number; unit: string }) {
  return (
    <span style={{ ...mono, fontSize: "var(--fs-modal-meta)" }}>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
      <span style={{ color: "var(--text-tertiary)" }}> {unit}</span>
    </span>
  );
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

// Month summary as a quiet one-line caption under the map, without a plate or border: figures in a row
// separated by a dot, in muted mono, set below the map with a small gap so nothing overlaps.
const summaryRow = {
  columnGap: 6,
  rowGap: 2,
  marginBottom: 12,
} satisfies CSSProperties;

const summaryCaption = {
  ...mono,
  fontSize: "var(--fs-modal-small)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

const summaryDot = {
  ...mono,
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;
