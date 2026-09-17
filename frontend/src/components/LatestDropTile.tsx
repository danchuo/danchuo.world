"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { getDrop, getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import { GAP, buildMosaic, dropCardWidth, mosaicWidth, type Cell } from "@/lib/mosaic";
import { SWIPE_NOTCH, frameWheelStep, stepFrameIndex } from "@/lib/dropRoll";
import { pluralRu } from "@/lib/rideFormat";
import { pickSeeded } from "@/lib/sample";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

/**
 * Editions of the tile, chosen by the WAVE through its layout; the component knows nothing of
 * waves and falls back to the mosaic on an unknown value. `mosaic` packs five frames justified,
 * `frame` gives one frame the whole card, `sheet` is a contact sheet. DESIGN §7.5, §10.1
 */
export type DropEdition = "mosaic" | "frame" | "sheet";

interface LatestDropTileProps {
  style?: CSSProperties;
  className?: string;
  /** The edition from the wave's layout (the string as is; validated here). */
  edition?: string;
  /** The drop gallery's edition from the wave's layout (see [PhotoDropModal]). */
  gallery?: string;
}

interface LatestData {
  latest: FilmDropView | null;
  photos: FilmPhotoView[];
}

/* TileShell horizontal padding (p-4 on both sides) — added back around the mosaic width. */
const CARD_PAD_X = 32;
/* Don't shrink the card below this: the label and caption row need room to breathe. */
const MIN_CARD_W = 200;
/**
 * The silence that ends a wheel gesture (ms): a trackpad sends dozens of events per flick, and a
 * pause is the only sign the hand let go. Less and scroll inertia reads as a second gesture; more
 * and an honest second flick has to be waited for.
 */
const WHEEL_GESTURE_GAP_MS = 140;
/** Inertial events below this size are the fading tail, not continued finger travel. */
const WHEEL_TAIL_PX = 4;
/** A fresh gesture must rise above its inertial tail before it may start accumulating travel. */
const WHEEL_REARM_PX = 12;

/**
 * The new frame's entry: a shift towards the gesture and its duration. The movement is
 * deliberately small — the frame is large, and a full-card slide would read as a fairground ride;
 * just enough for the eye to catch the direction.
 */
const FRAME_SLIDE_PX = 14;
const FRAME_SLIDE_MS = 260;

/* Frames per edition: the mosaic packs five, the sheet four (two rows of two), the frame one. */
const MOSAIC_FRAMES = 5;
const SHEET_FRAMES = 4;

/* useLayoutEffect warns during SSR of client components — fall back to useEffect there. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-drop-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

function resolveEdition(value: string | undefined): DropEdition {
  return value === "frame" || value === "sheet" ? value : "mosaic";
}

function framesLabel(count: number): string {
  return `${count} ${pluralRu(count, ["кадр", "кадра", "кадров"])}`;
}

/** Rows of the justified mosaic, shared by the `mosaic` and `sheet` editions. */
function renderRows(mosaic: Cell[][] | null) {
  return (
    <>
      {/* ⚠️ The row's width is handed out by THE FLEXBOX, not by pixels from JS: `flex-basis: 0`
          plus `flex-grow` proportional to cell width give the justified formula, computed by the
          layout engine from its own real width, so overflow is structurally impossible. */}
      {mosaic?.map((row, ri) => {
        // The computed row width stays a CEILING: where the card hits the cell's edge the
        // container is slightly wider than the calculation, and without the ceiling the row
        // would grow a pixel or two taller.
        const rowW = row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP;
        return (
          <div
            key={ri}
            className="flex"
            // `flex-start` on the cross axis: `stretch` would pull the picture to the row's
            // height and fight `aspect-ratio`.
            style={{ gap: GAP, width: "100%", maxWidth: rowW, alignItems: "flex-start" }}
          >
            {row.map((cell, ci) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${cell.photo.thumbUrl}-${ri}-${ci}`}
                src={mediaUrl(cell.photo.thumbUrl)}
                alt=""
                style={{
                  // grow by cell width = grow by aspect (the row's height is shared).
                  flex: `${cell.w} 1 0`,
                  minWidth: 0,
                  aspectRatio: `${cell.w} / ${cell.h}`,
                  height: "auto",
                  objectFit: "cover", // the box matches the frame's proportion ⇒ no cropping
                  borderRadius: "var(--radius-sm)",
                  display: "block",
                }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * The latest photo drop. By default five RANDOM frames in a justified mosaic — mixed orientations
 * packed by their real dimensions, with no cropping or distortion. A click opens the gallery; a
 * wave may pick another edition. Before the first upload it is a quiet empty. DESIGN §7.5
 */
export function LatestDropTile({
  style,
  className,
  edition: editionRaw,
  gallery,
}: LatestDropTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, settled, retry } = useTileData<LatestData>(
    useCallback(async (signal) => {
      const drops = await getDrops({ signal });
      if (drops.length === 0) return { latest: null, photos: [] };
      const latest = drops[0];
      const photos = await getDrop(latest.id, { signal });
      return { latest, photos };
    }, []),
    "latest-drop",
  );

  const latest = data?.latest ?? null;
  const isEmpty = phase === "loaded" && latest === null;
  const [open, setOpen] = useState(false);
  /**
   * The frame an opened reel stands on. The tile moves to it LOCALLY, in tab memory only, so a
   * reload restores the usual random sample. Coming back must land on the frame you left from, or
   * a vertical shot ends up stretched across a horizontal card. DESIGN §7.5
   */
  const [wantedFrame, setWantedFrame] = useState<FilmPhotoView | null>(null);
  /**
   * The frame already DECODED and standing on the card, kept apart from the requested one
   * ([wantedFrame]): the tile waits for the next shot on the current one rather than on nothing,
   * or a swipe would flash a hole.
   */
  const [shownFrame, setShownFrame] = useState<FilmPhotoView | null>(null);
  /** Where the new frame comes from: −1 left (a step back), +1 right, 0 no movement. */
  const [slide, setSlide] = useState(0);
  /**
   * The address of the frame the gallery was opened from, frozen for the viewing: the gallery
   * scrolls to it whenever it changes (`startAt`), and a live address would drag the ribbon back
   * on every movement of the strip.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  // The random sample is new per page load but ONE per load: the seed is taken on mount and the
  // choice from it is deterministic. The tile renders twice — cached copy, then the network answer
  // with the same frames — and without a seed the picture visibly changed twice.
  const [seed] = useState(() => Math.random());
  const sampleSize = edition === "sheet" ? SHEET_FRAMES : edition === "frame" ? 1 : MOSAIC_FRAMES;
  const sample = useMemo(() => pickSeeded(data?.photos ?? [], sampleSize, seed), [data?.photos, sampleSize, seed]);

  // Available width comes from the outer grid-cell wrapper, NOT from the card itself:
  // the card shrinks to the mosaic below, and measuring it back would loop the observer.
  const frameRef = useRef<HTMLDivElement>(null);
  // The frame card itself, which the gallery grows out of (DESIGN §7.5). The ref is needed on
  // closing too, so we hold it rather than a rectangle taken at click time.
  const frameCardRef = useRef<HTMLButtonElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [frameH, setFrameH] = useState(0);

  // The node lives in state via a callback ref, not in a ref: the card appears AFTER the network
  // answer, when the phase is already "loaded" from cache, so a measurement keyed on the phase
  // never re-ran — the block measured zero and no frames were laid out at all.
  const [boxEl, setBoxEl] = useState<HTMLButtonElement | null>(null);
  const [boxH, setBoxH] = useState(0);

  // Synchronous measure before paint: the shrunken width is computed in the same frame the
  // loaded content commits, so cached loads paint the card already hugged (no width flash).
  useIsomorphicLayoutEffect(() => {
    if (frameRef.current) {
      const r = frameRef.current.getBoundingClientRect();
      setFrameW(r.width);
      setFrameH(r.height);
    }
    if (boxEl) setBoxH(boxEl.getBoundingClientRect().height);
  }, [phase, isEmpty, edition, boxEl]);

  // ResizeObserver keeps the measurements live afterwards (window resize, wave/layout swap).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom tests have no ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === frameRef.current) {
          setFrameW(entry.contentRect.width);
          setFrameH(entry.contentRect.height);
        }
        if (entry.target === boxEl) setBoxH(entry.contentRect.height);
      }
    });
    if (frameRef.current) ro.observe(frameRef.current);
    if (boxEl) ro.observe(boxEl);
    return () => ro.disconnect();
  }, [phase, isEmpty, edition, boxEl]);

  // Mosaic and sheet share the packer: rows justified by real aspect, no crop, both orientations.
  const mosaic = useMemo(
    () => (edition !== "frame" ? buildMosaic(sample, mosaicWidth(frameW, CARD_PAD_X), boxH) : null),
    [edition, sample, frameW, boxH],
  );

  // Shrink-to-content (per-shuffle): when scale <1 leaves side gaps, the card hugs the
  // widest mosaic row and centers in the cell — label and caption ride along with it.
  const usedW = mosaic
    ? Math.max(...mosaic.map((row) => row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP))
    : 0;
  // The card width goes through `dropCardWidth` rather than by hand: it holds the invariant that
  // there is always slack between the mosaic and the card's edge. The card used to hug the row
  // exactly (measured gap 0.00–0.02px) and Safari clipped the right frame.
  const cardW = usedW > 0 && frameW > 0 ? dropCardWidth(usedW, frameW, CARD_PAD_X, MIN_CARD_W) : null;

  // Frame edition: the card takes the photo's aspect. In the bento the host gives the wrapper a
  // height and the card fits inside it; in the stack there is no slot height — the wrapper is as
  // tall as the card, and measuring it back would loop — so width rules there.
  const wanted = edition === "frame" ? (wantedFrame ?? sample[0] ?? null) : null;
  // The frame card appears only together with its photo. An empty card with no width stood as a
  // narrow vertical strip for a moment on fast reloads — better a pause without the widget than a
  // widget without content. The photo is preloaded and only then placed on the card.
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setShownFrame(wanted);
    };
    img.src = mediaUrl(wanted.imageUrl);
    return () => {
      alive = false;
    };
  }, [wanted]);
  const frame = edition === "frame" ? shownFrame : null;

  /**
   * Neighbouring frames are prefetched, two each way. A swipe only shows a frame once loaded, so
   * without this every gesture on a phone hit the network. The window is narrow on purpose:
   * dragging the whole drop for a passer-by is the cost being avoided. DESIGN §7.5
   */
  useEffect(() => {
    const list = data?.photos ?? [];
    if (!wanted || list.length < 2) return;
    const base = list.findIndex((p) => p.imageUrl === wanted.imageUrl);
    if (base < 0) return;
    for (const i of [base + 1, base - 1, base + 2, base - 2]) {
      if (i < 0 || i >= list.length) continue;
      new Image().src = mediaUrl(list[i].imageUrl);
    }
  }, [wanted, data?.photos]);

  /**
   * Swiping the card pages the drop's reel, with no step past either end. It counts from the
   * REQUESTED frame rather than the one on screen: while a new photo decodes, a second gesture
   * would otherwise just repeat the first.
   */
  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const list = data?.photos ?? [];
      const base = wanted ? list.findIndex((p) => p.imageUrl === wanted.imageUrl) : -1;
      if (base < 0) return;
      const next = stepFrameIndex(base, dir, list.length);
      if (next === base) return; // first or last frame — the roll goes no further
      setSlide(dir);
      setWantedFrame(list[next]);
    },
    [data?.photos, wanted],
  );

  // Dragging, pointer events for finger and mouse alike. ONE GESTURE IS WORTH EXACTLY ONE FRAME,
  // however long it is, and the threshold counts from the gesture's start. The `moved` flag is
  // cleared by the NEXT gesture, not by the click that read it — that click does not always come.
  const dragRef = useRef<{ from: number; done: boolean } | null>(null);
  const movedRef = useRef(false);
  const onFramePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    movedRef.current = false;
    dragRef.current = { from: e.clientX, done: false };
  };
  const onFramePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.done) return;
    const dx = e.clientX - drag.from;
    if (Math.abs(dx) < SWIPE_NOTCH) return;
    drag.done = true; // this gesture has spent its frame; the rest of the travel is not a second step
    movedRef.current = true;
    stepFrame(dx < 0 ? 1 : -1);
  };
  const onFramePointerEnd = () => {
    dragRef.current = null;
  };

  // Trackpad: a two-finger horizontal gesture arrives as wheel events, so the listener is native
  // and NOT passive, which is the only way it may cancel sideways page scrolling. It is attached
  // BY CALLBACK REF, not an effect — reattaching mid-gesture hands the rest of it to the page.
  const stepRef = useRef(stepFrame);
  stepRef.current = stepFrame;
  const wheelRef = useRef<{ acc: number; spent: boolean; armed: boolean; quiet: ReturnType<typeof setTimeout> | null }>({
    acc: 0,
    spent: false,
    armed: true,
    quiet: null,
  });
  const detachWheelRef = useRef<(() => void) | null>(null);
  const mountFrameCard = useCallback((el: HTMLButtonElement | null) => {
    frameCardRef.current = el;
    detachWheelRef.current?.();
    detachWheelRef.current = null;
    if (!el) return;
    const gesture = wheelRef.current;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const dx = Math.abs(e.deltaX * (e.deltaMode === 1 ? 16 : 1));
      // A trackpad's inertial tail may keep emitting tiny events long after the fingers lift. Those
      // events must not postpone rearming forever; meaningful travel still extends this gesture.
      if (dx > WHEEL_TAIL_PX) {
        if (gesture.quiet) clearTimeout(gesture.quiet);
        gesture.quiet = setTimeout(() => {
          gesture.acc = 0;
          gesture.spent = false;
          gesture.armed = false;
        }, WHEEL_GESTURE_GAP_MS);
      }
      // After the old gesture ends, ignore its remaining tiny drift. A new deliberate flick rises
      // above this threshold without needing any pointer movement over the card.
      if (!gesture.spent && !gesture.armed) {
        if (dx < WHEEL_REARM_PX) return;
        gesture.armed = true;
      }
      const step = frameWheelStep(e.deltaX, e.deltaMode, gesture.acc, gesture.spent);
      gesture.acc = step.acc;
      if (step.dir === 0) return;
      gesture.spent = true;
      stepRef.current(step.dir);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    detachWheelRef.current = () => el.removeEventListener("wheel", onWheel);
  }, []);

  // The gesture-end timer lives in a ref and outlives the listener, so it is cleared separately —
  // when the tile unmounts, not with the card's node.
  useEffect(() => {
    const gesture = wheelRef.current;
    return () => {
      if (gesture.quiet) clearTimeout(gesture.quiet);
    };
  }, []);

  /**
   * The new frame's entrance. The animation is IMPERATIVE because the frame layer must stay the
   * same node — a CSS animation plays on an element appearing, and nothing appears here any more,
   * only attributes change. A small shift towards the gesture; honours reduced motion.
   */
  const viewRef = useRef<HTMLSpanElement>(null);
  const shownUrl = frame?.imageUrl ?? null;

  /**
   * Which frame is ALREADY painted; while a new one decodes this holds the previous, which is also
   * what backs the card. `complete` is checked in an effect, because a cached frame fires its load
   * event before React attaches the handler and the backing would stick forever.
   */
  const imgRef = useRef<HTMLImageElement>(null);
  const [paintedUrl, setPaintedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (shownUrl && imgRef.current?.complete) setPaintedUrl(shownUrl);
  }, [shownUrl]);
  // The backing is needed only while the new frame has not landed, and only if there is one.
  const holdUrl = shownUrl !== null && paintedUrl !== null && paintedUrl !== shownUrl ? paintedUrl : null;
  useEffect(() => {
    const el = viewRef.current;
    // jsdom has no `animate`, so in tests the effect simply stays quiet, which is what they need.
    if (!el || !shownUrl || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const play = el.animate(
      [
        { opacity: 0, transform: `translateX(${slide * FRAME_SLIDE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: FRAME_SLIDE_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
    );
    return () => play.cancel();
    // `slide` changes with the frame request and already holds the gesture's side by the time it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUrl]);

  const frameStyle = useMemo<CSSProperties>(() => {
    if (!frame) return { height: "100%" };
    // A frame without dimensions (an old drop from before measuring) counts as landscape 3:2.
    const fw = frame.width ?? 3;
    const fh = frame.height ?? 2;
    const a = fw / fh;
    const aspect = `${fw} / ${fh}`;
    if (frameW <= 0) return { aspectRatio: aspect, width: "100%" };
    const slotH = style?.height !== undefined ? frameH : 0;
    let w = frameW;
    let h = frameW / a;
    if (slotH > 0 && h > slotH) {
      h = slotH;
      w = slotH * a;
    }
    return { aspectRatio: aspect, width: w, height: h };
  }, [frame, frameW, frameH, style?.height]);

  // Hug the mosaic ONLY in the bento. In the stack the slot sets no height, so the frame block
  // takes it from its own width — and fitting the width then closes a loop: narrower card, shorter
  // block, different row packing, different width again. On a phone the widget never settles.
  const hugCard = style?.height !== undefined;
  const cardStyle: CSSProperties =
    edition === "frame"
      ? frame
        ? frameStyle
        : // Empty or failed in the frame edition: the card is still needed (it holds the empty
          // and retry states) but there is no frame proportion — take film's 3:2 at full width.
          { width: "100%", aspectRatio: "3 / 2" }
      : hugCard && cardW !== null
        ? // No `transition: width` here — see the note above the component: an animated
          // width on this filtered card smears its drop-shadow across the side gaps in
          // WebKit.
          { height: "100%", width: cardW, marginInline: "auto" }
        : { height: "100%" };

  const openLabel = latest ? `Открыть дроп «${latest.title}»` : undefined;
  const meta = latest
    ? [latest.monthLabel, framesLabel(latest.photoCount)].filter(Boolean).join(" · ")
    : "";

  // No card until the NETWORK HAS ANSWERED, so a cached copy is never shown "for a second before
  // the fresh one". While the gallery is open the tile is NOT hidden even so: its rectangle is
  // what the return morph lands on, and without it there is nowhere to sit.
  const hidden = !settled || (edition === "frame" && wanted !== null && frame === null && !open);

  return (
    <>
      {/* Measuring wrapper keeps the cell's full footprint; the card inside may be narrower. */}
      <div
        ref={frameRef}
        style={style}
        className={`tile-frame t-drop-vars ${edition === "frame" ? "drop-slot--frame" : ""} ${className ?? ""}`}
      >
        {hidden ? null : (
        <TileShell
          state={isEmpty ? "empty" : phase}
          emptyText="пока нет дропов"
          onRetry={retry}
          label="последний дроп"
          ariaLabel="Последний фото-дроп"
          className={edition === "frame" ? "drop-card--frame" : ""}
          style={cardStyle}
        >
          {phase === "loaded" && latest && edition === "frame" && frame && (
            // One frame filling the card, the caption inside the bottom band that the frame gives
            // to progressive blur — text on the photo, not under it, with no plate. The caption is
            // IN the band, so a title wrapping to a second line deepens it by itself.
            <button
              ref={mountFrameCard}
              type="button"
              className="drop-frame"
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={onFramePointerEnd}
              onPointerCancel={onFramePointerEnd}
              onClick={() => {
                // The gesture was just paging the roll, so this was a swipe and not a click.
                if (movedRef.current) return;
                setOpenedAt(frame.imageUrl);
                setOpen(true);
              }}
              aria-label={openLabel}
            >
              {/* ⚠️ The frame and its band slide in as ONE layer that is NOT recreated on a frame
                  change: a node vanishing from under the cursor takes the hover target with it,
                  and the card stops receiving wheel events until the mouse moves. */}

              {/* The card's proportion changes AT ONCE while the shot arrives later, and the wave's
                  glass showed through that gap. The backing holds the previous frame blurred. */}
              {holdUrl && (
                <span
                  className="drop-frame__hold"
                  style={{ "--drop-frame-hold": `url("${mediaUrl(holdUrl)}")` } as CSSProperties}
                  aria-hidden
                />
              )}
              <span ref={viewRef} className="drop-frame__view">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={mediaUrl(frame.imageUrl)}
                  alt=""
                  className="drop-frame__img"
                  onLoad={() => setPaintedUrl(frame.imageUrl)}
                />
                {/* The band carries the frame's address in a variable: under the caption lie two
                    BLURRED COPIES of the shot (`.drop-frame__blur`), not a backdrop-filter, whose
                    sampling clamps at the box's edges and leaves a grey line. */}
                <span
                  className="drop-frame__band"
                  style={{ "--drop-frame-src": `url("${mediaUrl(frame.imageUrl)}")` } as CSSProperties}
                >
                  <span className="drop-frame__blur drop-frame__blur--soft" aria-hidden />
                  <span className="drop-frame__blur drop-frame__blur--deep" aria-hidden />
                  <span className="drop-frame__caption">
                    <span className="drop-frame__title">{latest.title}</span>
                    <span className="drop-frame__meta">{meta}</span>
                  </span>
                </span>
              </span>
            </button>
          )}

          {phase === "loaded" && latest && edition === "sheet" && (
            <div className="flex h-full flex-col gap-1">
              {/* The data row on TOP, like a contact sheet's header: name and month left, frame count right. */}
              <div className="drop-sheet__head flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ fontSize: "var(--fs-drop-title)", color: "var(--text-primary)" }}>
                  {latest.title}
                  {latest.monthLabel && <span style={monoTertiary}> · {latest.monthLabel}</span>}
                </span>
                <span className="shrink-0" style={monoTertiary}>
                  {framesLabel(latest.photoCount)}
                </span>
              </div>
              {/* The same packing as the mosaic (no cropping, no rotation, both orientations) but
                  four frames: two rows of two in a square tile. `drop-mosaic` is for its own
                  height in the stack (§8), `drop-sheet` is the edition's hook. */}
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                className="drop-mosaic drop-sheet flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
              </button>
            </div>
          )}

          {phase === "loaded" && latest && edition === "mosaic" && (
            <div className="flex h-full flex-col gap-1">
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                // drop-mosaic: its own height where the parent sets none (the mobile stack, §8) —
                // without it boxH=0, the layout is never built and no frames appear at all.
                className="drop-mosaic flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
              </button>

              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ fontSize: "var(--fs-drop-title)", color: "var(--text-primary)" }}>
                  {latest.title}
                </span>
                {latest.monthLabel && <span style={monoTertiary}>{latest.monthLabel}</span>}
              </div>
            </div>
          )}
        </TileShell>
        )}
      </div>

      {open && latest && (
        <PhotoDropModal
          dropId={latest.id}
          title={latest.title}
          monthLabel={latest.monthLabel}
          gallery={gallery}
          // The frame edition shows ONE shot, so the gallery must open on it: clicking a frame
          // asks about that frame. Other editions show several and "the one" is undefined.
          startAt={edition === "frame" ? openedAt : null}
          // The frames are already in hand — the tile fetched them for its own layout. The gallery
          // need not open a loader over the same data.
          initialPhotos={data?.photos}
          // The developing animation runs only from the frame edition: there the tile shows ONE
          // shot and the same one meets you in the gallery. Elsewhere there is nothing to grow from.
          origin={edition === "frame" ? frameCardRef : undefined}
          // The tile follows the roll while it is open, so by closing time it already shows the
          // frame you left on and the animation has somewhere to return to without stretching.
          onFrameShown={edition === "frame" ? setWantedFrame : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
