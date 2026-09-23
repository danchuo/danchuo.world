"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { getDrop } from "@/lib/api/client";
import { boxesAt } from "@/lib/artifactHighlight";
import { photoUrl } from "@/lib/api/media";
import {
  MOSAIC_NARROW_PX,
  MOSAIC_UNITS,
  MOSAIC_UNITS_NARROW,
  columnMajorMosaic,
  type MosaicCell,
} from "@/lib/dropMosaic";
import type { FilmPhotoView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";
import { DropRoll } from "./DropRoll";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";
import { useCoarsePointer } from "./useCoarsePointer";
import { useDropMorph } from "./useDropMorph";
import { useTileData } from "./useTileData";

interface PhotoDropModalProps {
  dropId: number;
  title: string;
  monthLabel: string | null;
  /**
   * Gallery edition from the wave's layout (`layout.gallery`, DESIGN §10.1): `roll` is the reel and
   * anything else, including absence, is the mosaic. Taken as a string and validated here like a
   * tile's edition — the set of editions is the gallery's knowledge, unknown to the layout registry.
   */
  gallery?: string;
  /**
   * Address of the frame to open the gallery on: a tile in the frame edition shows ONE photo, and
   * opening the drop from the start would lose the frame that was clicked. The mosaic ignores the
   * field — there the whole drop is on screen at once and "open on a frame" means nothing.
   */
  startAt?: string | null;
  /**
   * Frames the tile already loaded. It fetches the drop for its own mosaic before any click, so
   * opening the gallery with a loader over the very same data would show an empty panel for
   * nothing. With the develop transition it is required: a frame cannot grow from no scene. §7.5
   */
  initialPhotos?: FilmPhotoView[];
  /**
   * The board frame the gallery grows from (develop transition, DESIGN §7.5). It arrives only from
   * where "that exact frame" is defined, the `frame` edition; without it the gallery opens as before.
   * A ref rather than a rectangle: it has to be measured both on opening and on closing.
   */
  origin?: RefObject<HTMLElement | null>;
  /**
   * The frame currently being viewed. The board tile switches to it, so the transition returns into
   * the frame being left rather than the one entered on (DESIGN §7.5).
   */
  onFrameShown?: (photo: FilmPhotoView) => void;
  onClose: () => void;
}

/**
 * The photo-drop gallery modal: a large overlay, not a new tab, with a focus trap and vertical
 * scroll. Frames load blur-up — the thumb stays an opaque backing so the tile never shows through
 * — and each frame is a BUTTON opening a full-screen layer ABOVE the gallery. DESIGN §7.5
 */
export function PhotoDropModal({
  dropId,
  title,
  monthLabel,
  gallery,
  startAt,
  initialPhotos,
  origin,
  onFrameShown,
  onClose,
}: PhotoDropModalProps) {
  const roll = gallery === "roll";
  const { phase, data } = useTileData<FilmPhotoView[]>(
    useCallback((signal) => getDrop(dropId, { signal }), [dropId]),
  );
  const photos = data ?? initialPhotos ?? [];
  // Frames from the tile are full content rather than a copy for a second: they are the answer of the
  // same `getDrop(id)`. While its own request travels the gallery is already open and working.
  const shown = photos.length > 0 ? "loaded" : phase;
  const sceneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  // The frame opened full-screen, and the tile it was opened from, which will get the focus back.
  const [zoomed, setZoomed] = useState<number | null>(null);
  const zoomTriggerRef = useRef<HTMLElement | null>(null);

  // Cells across, not by media query: the layout is computed in JS, which needs the same number the
  // grid is declared with, or the frames would run past its edge.
  const units = useMosaicUnits();
  const cells = useMemo(
    () => columnMajorMosaic(photos.map(isPortrait), units),
    [photos, units],
  );

  // Develop transition: the frame grows out of the tile and pulls into focus (DESIGN §7.5). The seam
  // is shared and switched on by the wave (`--drop-morph`), so no wave key or animation number is here.
  const { playIn, requestClose } = useDropMorph({ origin, sceneRef, onClose });
  // Played once the frame's scene is laid out: before the frames exist there is nothing to measure. A
  // layout effect rather than a plain one — the transform must land BEFORE the gallery's first paint,
  // or the frame flashes in place. SSR is no danger: the gallery exists only after a click.
  useLayoutEffect(() => {
    if (shown === "loaded" && photos.length > 0) playIn();
  }, [shown, photos.length, playIn]);

  const closeZoom = useCallback(() => {
    setZoomed(null);
    zoomTriggerRef.current?.focus();
  }, []);

  // The system Back closes the window rather than leaving the site (DESIGN §9). There are two layers,
  // and the order of declaration is the order of closing: the full-screen frame first, the gallery next.
  useBackToClose(true, requestClose);
  useBackToClose(zoomed !== null, closeZoom);

  // Initial focus once, at mount: reopening a frame must not pull focus back into the header.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc closes the top layer; Tab is kept inside it (a minimal focus trap, DESIGN §9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomed !== null) closeZoom();
        else requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const trap = lightboxRef.current ?? panelRef.current;
      const focusable = trap?.querySelectorAll<HTMLElement>(
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
  }, [requestClose, zoomed, closeZoom]);

  return (
    <>
      <div
        ref={sceneRef}
        className="drop-scene modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
        onClick={requestClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          // With four frames per row the panel's width IS the frame size, hence how wide it is: on
          // a narrow panel a horizontal frame drops under 250px, too small to read a reel. The
          // mosaic gets no such fitting — its thirty-six frames outrun the screen by design.
          className={`drop-modal__panel pixel-tile my-auto w-full max-w-[64rem] p-4 ${roll ? "drop-modal__panel--roll" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* The box backing plus the white inner frame (§2.4), as in TileShell: the modal panel
              carries .pixel-tile itself, so the layer elements are added here. */}
          <span className="pixel-slab" aria-hidden />
          <span className="pixel-lid" aria-hidden />
          <div className="drop-modal__head mb-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>{title}</span>
              {monthLabel && (
                <span style={{ ...monoTertiary }}>{monthLabel}</span>
              )}
            </div>
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

          {shown === "loading" && <p style={monoTertiary}>загрузка…</p>}
          {shown === "error" && <p style={monoTertiary}>не удалось загрузить дроп</p>}
          {shown === "loaded" && photos.length === 0 && (
            <p style={monoTertiary}>в этом дропе пока нет кадров</p>
          )}
          {shown === "loaded" && photos.length > 0 && roll && (
            // The reel: one rail instead of a grid (DESIGN §7.5). Full screen is opened only by the
            // loupe button — the photo itself is moved over with the mouse, examining finds.
            <DropRoll
              photos={photos}
              startAt={startAt}
              onZoom={(index, trigger) => {
                zoomTriggerRef.current = trigger;
                setZoomed(index);
              }}
              onCurrent={onFrameShown}
            />
          )}
          {shown === "loaded" && photos.length > 0 && !roll && (
            // Quantised mosaic: a frame takes a whole number of grid cells, 3x2 or 2x3, so both
            // cover six cells and areas are equal by construction. A justified layout equalises row
            // height instead, which makes a vertical frame half the area of its neighbour.
            <div
              className="drop-gallery"
              style={{ gridTemplateColumns: `repeat(${units}, 1fr)` }}
            >
              {photos.map((p, i) => (
                <BlurUpPhoto
                  key={p.imageUrl}
                  photo={p}
                  index={i}
                  cell={cells[i]}
                  onOpen={(el) => {
                    zoomTriggerRef.current = el;
                    setZoomed(i);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {zoomed !== null && photos[zoomed] && (
        <PhotoLightbox
          ref={lightboxRef}
          photo={photos[zoomed]}
          index={zoomed}
          total={photos.length}
          // From the reel a frame opens CLEAN: finds are examined on the reel itself, and full screen
          // exists for the photograph, where boxes over it only get in the way.
          artifacts={!roll}
          onClose={closeZoom}
        />
      )}
    </>
  );
}

/**
 * A frame full-screen, a layer ABOVE the gallery rather than a replacement, so closing it returns
 * exactly what was there. The picture is contained whole — a film frame is looked at whole.
 * Clicking the PICTURE does not close: missing the backdrop must not cost the viewing.
 */
const PhotoLightbox = forwardRef<
  HTMLDivElement,
  {
    photo: FilmPhotoView;
    index: number;
    total: number;
    /** Whether to show finds over the frame; `false` gives a clean photo (the reel, see [DropRoll]). */
    artifacts?: boolean;
    onClose: () => void;
  }
>(function PhotoLightbox({ photo, index, total, artifacts = true, onClose }, ref) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const coarse = useCoarsePointer();
  const boxes = photo.artifacts ?? [];
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`кадр ${index + 1} из ${total}`}
      className="modal-scale fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(20, 15, 12, 0.92)" }}
      onClick={onClose}
    >
      {/* The scene repeats the frame's proportion, so the picture fills it without margins and
          finding boxes can be placed in percentages straight from it. With no known `width/height`
          there is no proportion — the scene hugs the picture and boxes are not drawn. */}
      <span
        className="lightbox-stage"
        style={ratio ? { aspectRatio: ratio } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lightbox-photo" src={photoUrl(photo.imageUrl)} alt="" />
        {/* The touch flow (DESIGN §7.5): there is no hover on a phone and a tap is taken by opening
            fullscreen, so the fullscreen frame explains the findings itself. With a mouse the
            fullscreen carries no findings: hovering in the gallery already shows them. */}
        {artifacts && ratio && coarse && (
          <ArtifactBoxes boxes={boxes} shown={boxes.map((a) => a.artifactId)} />
        )}
      </span>
      <button
        ref={closeRef}
        type="button"
        className="tap-target lightbox-close"
        onClick={onClose}
        aria-label="Закрыть кадр"
      >
        <Icon name="close" size={22} />
      </button>
    </div>
  );
});

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

/**
 * One frame with blur-up loading: the thumb shows at once and the full image fades in over it once
 * ready. Its place is held by its mosaic cell, so the grid never jumps while loading. Reduced
 * motion drops the transition and the frame simply appears when ready.
 */
function BlurUpPhoto({
  photo,
  index,
  cell,
  onOpen,
}: {
  photo: FilmPhotoView;
  index: number;
  /** Mosaic cell; `undefined` means the layout is not computed yet and the frame flows automatically. */
  cell?: MosaicCell;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const portrait = isPortrait(photo);
  const boxes = photo.artifacts ?? [];
  // Which finds lie under the cursor. Computed from the point rather than from a box's `:hover`: boxes
  // overlap (a shirt and glasses on one person) and `:hover` only reaches the topmost.
  const [under, setUnder] = useState<number[]>([]);

  const trackPointer = (e: ReactMouseEvent<HTMLElement>) => {
    if (boxes.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ids = boxesAt(boxes, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      .map((b) => b.artifactId);
    setUnder((cur) => {
      // The HOVER ORDER is kept rather than the order of finds: whoever came under the cursor later has
      // their card on top. Otherwise, where boxes overlap, the same plate would always be uppermost and
      // the lower find could never be reached — its card would be unreachable.
      const kept = cur.filter((id) => ids.includes(id));
      const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
      // The mouse sends events in bursts, so we repaint only when the set has actually changed.
      return cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next;
    });
  };

  return (
    <button
      type="button"
      className="drop-frame"
      aria-label={`открыть кадр ${index + 1} на весь экран`}
      onClick={(e) => onOpen(e.currentTarget)}
      onMouseMove={trackPointer}
      onMouseLeave={() => setUnder([])}
      // The cell's ratio comes from CSS through this hook; its place in the grid from the layout pass.
      data-portrait={portrait ? "true" : undefined}
      style={{
        position: "relative",
        gridColumn: cell && `${cell.col + 1} / span ${cell.w}`,
        gridRow: cell && `${cell.row + 1} / span ${cell.h}`,
      }}
    >
      {/* This clips THE PICTURE, not the whole frame: `filter: blur()` on the thumb spreads beyond
          the element and the frames would glow. Clipping the frame would also cut artifact
          captions, which must be able to leave it entirely. */}
      <span
        style={{
          position: "relative",
          display: "block",
          overflow: "hidden",
          background: "var(--bg-surface-muted)",
          borderRadius: "var(--radius-sm)",
          // The shape comes from the mosaic cell rather than the frame's ratio: the picture fills it
          // (`cover`), cropping its own 0.3% — the rounding of 1.495 to 3:2.
          height: "100%",
        }}
      >
        {/* The blurred preview is an opaque backing: it holds colour and composition for as long as
            the full frame is developing (never faded, or the tile's background flashes through). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(photo.thumbUrl)}
          alt=""
          aria-hidden
          className="blur-up-thumb"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-sm)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(photo.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="blur-up-full"
          data-loaded={loaded}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-sm)",
          }}
        />
        {/* The hover dimming signals "this frame is clickable". It sits inside the clip so it does
            not spill past the picture's rounded edge. */}
        <span className="drop-frame__scrim" aria-hidden />
      </span>
      <ArtifactBoxes boxes={boxes} shown={under} />
      {/* The "larger" glyph comes last in the tree so it lies over the whole frame. It is decor:
          the button's accessible name is what tells a screen reader the frame opens. */}
      <span className="drop-frame__zoom" aria-hidden>
        <Icon name="zoom" size={16} />
      </span>
    </button>
  );
}

/**
 * Whether a frame is portrait. With no dimensions (uploaded before they were stored) it counts as
 * landscape: that is the shape of most film frames, and one guess will not break the mosaic.
 */
function isPortrait(photo: FilmPhotoView): boolean {
  const w = photo.width ?? 0;
  const h = photo.height ?? 0;
  return w > 0 && h > 0 && h > w;
}

/** Cells across the mosaic: on a narrow window two columns, not four, or a frame is smaller than a finger. */
function useMosaicUnits(): number {
  const [units, setUnits] = useState(MOSAIC_UNITS);
  useEffect(() => {
    const mql = window.matchMedia?.(`(max-width: ${MOSAIC_NARROW_PX}px)`);
    if (!mql) return;
    const sync = () => setUnits(mql.matches ? MOSAIC_UNITS_NARROW : MOSAIC_UNITS);
    sync();
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);
  return units;
}
