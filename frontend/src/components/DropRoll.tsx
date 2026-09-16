"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { boxesAt } from "@/lib/artifactHighlight";
import { mediaUrl } from "@/lib/api/media";
import {
  nearestFrameIndex,
  startFrameIndex,
  stripPadding,
  swipeStep,
  tickIndexAt,
  toothHeight,
  wheelStep,
} from "@/lib/dropRoll";
import type { FilmPhotoView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";
import { Icon } from "./Icon";
import { useRollMotion } from "./useRollMotion";

/** How many neighbouring frames to keep preloaded at full size on each side. */
const PRELOAD_AHEAD = 3;
/**
 * Magnet radius of the comb, in px: how far from the cursor the teeth still grow, and between
 * which heights. `COMB_BASE` MUST match the resting height in CSS and `COMB_CURRENT` the current
 * frame's tooth — JS writes heights only while the cursor is over the row, then hands them back.
 */
const COMB_RADIUS = 78;
const COMB_BASE = 8;
const COMB_PEAK = 30;
const COMB_CURRENT = 26;

/**
 * The drop gallery in its "film" edition: one reel, read as a reel — a large frame, a thumbnail
 * strip, and a magnetic comb that is the ONLY control. The strip's scroll position is the single
 * source of truth, and the strip carries half-window padding so the last frames stay reachable.
 */
export function DropRoll({
  photos,
  startAt,
  onZoom,
  onCurrent,
}: {
  photos: FilmPhotoView[];
  /** Address of the frame to open the reel on (the tile's frame); none means the first. */
  startAt?: string | null;
  /** Open a frame full-screen, clean, with no detections over it. */
  onZoom: (index: number, trigger: HTMLElement) => void;
  /** Which frame is large now. The board tile listens so it can return to it (§7.5). */
  onCurrent?: (photo: FilmPhotoView) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => startFrameIndex(photos, startAt), [photos, startAt]);
  const [current, setCurrent] = useState(initial);
  // Which full frames are already in the browser cache. Kept in a ref plus a counter rather than a
  // state set: neighbour preloading writes here, and a redraw is needed only to drop the blur.
  const readyRef = useRef<Set<string>>(new Set());
  const [, bumpReady] = useState(0);
  // The last REQUESTED frame: smooth scrolling takes several painted frames, and a chain of wheel
  // clicks counting from the visible one would mark time. Cleared when the ribbon arrives, and
  // when a hand takes hold of it — the request is moot by then.
  const targetRef = useRef<number | null>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const peekImgRef = useRef<HTMLImageElement>(null);
  const peekNoRef = useRef<HTMLSpanElement>(null);
  /** Whether the comb is being dragged right now: while it is, mouse movement moves the reel. */
  const scrubbingRef = useRef(false);
  /** Where the cursor is over the comb (clientX); `null` means it is not over the row. */
  const combXRef = useRef<number | null>(null);
  // Side padding is computed from the ribbon window's LIVE width, which depends on the modal's,
  // which depends on the screen. Before the first measurement it is 0 — the ribbon simply starts
  // at the beginning, with no jump.
  const [pad, setPad] = useState(0);

  /**
   * The ribbon's own motion towards a frame — the seam shared by both drop ribbons: native smooth
   * scrolling aborted its animation on every new call and accelerated from zero again.
   */
  const motion = useRollMotion(stripRef, "x");
  const scrollTo = useCallback(
    (index: number, smooth: boolean) => {
      if (smooth) motion.to(index);
      else motion.jump(index);
    },
    [motion],
  );

  // Padding comes from the window's width and the thumbnail's (which the wave's CSS sets, so it is
  // measured rather than hardcoded). Recomputed on resize: the modal is fluid.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const item = strip.children[0] as HTMLElement | undefined;
      setPad(stripPadding(strip.clientWidth, item?.offsetWidth ?? 0));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom tests have no ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [photos.length]);

  // Open on the tile's frame, without animation: this is a starting position, not a transition. We
  // wait for the padding — before it the outermost frames have no room to centre, and the scroll
  // would land in the wrong place.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || pad === 0) return;
    jumped.current = true;
    scrollTo(initial, false);
  }, [initial, pad, scrollTo]);

  /**
   * Shapes the comb under the cursor and returns the tooth it stands over. Heights are written
   * straight to style, as the event fires every pixel and redrawing the gallery is impossible.
   * Measurements happen in ONE pass before any write, or the browser relayouts 37 times a move.
   */
  const shapeComb = useCallback((clientX: number | null): number => {
    const scrub = scrubRef.current;
    if (!scrub) return -1;
    const ticks = Array.from(scrub.querySelectorAll<HTMLElement>(".drop-roll__tick"));
    if (clientX === null) {
      ticks.forEach((tick) => {
        tick.style.height = "";
      });
      return -1;
    }
    const row = scrub.getBoundingClientRect();
    const shaped = ticks.map((tick) => {
      const r = tick.getBoundingClientRect();
      const base = tick.classList.contains("is-current") ? COMB_CURRENT : COMB_BASE;
      return toothHeight(r.left + r.width / 2 - clientX, COMB_RADIUS, base, COMB_PEAK);
    });
    ticks.forEach((tick, i) => {
      tick.style.height = `${shaped[i].toFixed(1)}px`;
    });
    return tickIndexAt(clientX - row.left, row.width, ticks.length);
  }, []);

  // Frame changed while the cursor is still over the row: reshape the comb. Heights live in inline
  // styles written only on mouse movement, so after a click the old tooth would stay tall until
  // the mouse twitched. The effect runs post-commit, when `is-current` has already moved.
  useEffect(() => {
    if (combXRef.current !== null) shapeComb(combXRef.current);
  }, [current, shapeComb]);

  /**
   * The frame under the finger, as a thumbnail popped above the comb. It IS the answer to "where
   * will I land": the ribbon shows only a few frames around the current one while the comb spans
   * the whole drop, and without a preview its far end would be poked at blind.
   */
  const movePeek = useCallback(
    (index: number, x: number) => {
      const peek = peekRef.current;
      const photo = photos[index];
      if (!peek || !photo) return;
      peek.hidden = false;
      // Keep the card within the row: at the first and last frame it otherwise overhangs the comb's
      // edge, where the modal panel clips it — and the outermost frame's preview is never seen.
      const half = peek.offsetWidth / 2;
      const row = peek.parentElement?.clientWidth ?? 0;
      peek.style.left = `${row > peek.offsetWidth ? Math.max(half, Math.min(row - half, x)) : x}px`;
      const src = mediaUrl(photo.thumbUrl);
      if (peekImgRef.current && peekImgRef.current.getAttribute("src") !== src) {
        peekImgRef.current.setAttribute("src", src);
      }
      if (peekNoRef.current) peekNoRef.current.textContent = String(index + 1).padStart(2, "0");
    },
    [photos],
  );

  // Ribbon scroll to current frame. Computed in rAF: scroll events arrive in bursts while we need
  // one answer per painted frame.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const mid = strip.scrollLeft + strip.clientWidth / 2;
        const centers = Array.from(strip.children).map((el) => {
          const item = el as HTMLElement;
          return item.offsetLeft + item.offsetWidth / 2;
        });
        const next = nearestFrameIndex(centers, mid);
        if (targetRef.current === next) targetRef.current = null; // arrived — the request is done
        setCurrent(next);
      });
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [photos.length]);

  // Wheel and trackpad page the reel, one frame per click, ANYWHERE over the gallery panel — the
  // hand is already on the frame. We listen to the PANEL, not the window: over the dimmed backdrop
  // the mouse has left the gallery. How many frames one event is worth: [wheelStep].
  useEffect(() => {
    const host = (rollRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? rollRef.current;
    if (!host) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 && e.deltaY === 0) return;
      e.preventDefault();
      const step = wheelStep(e.deltaX, e.deltaY, e.deltaMode, acc);
      acc = step.acc;
      const dir = step.dir;
      if (dir === 0) return;
      // Counted from the last REQUESTED frame rather than the visible one: smooth scrolling is
      // still travelling, and a chain of clicks would otherwise mark time.
      const base = targetRef.current ?? current;
      const next = Math.min(photos.length - 1, Math.max(0, base + dir));
      targetRef.current = next;
      scrollTo(next, true);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [current, photos.length, scrollTo]);

  // Swipe on the FRAME ITSELF (DESIGN §7.5). On a phone the comb and strip are millimetre targets
  // while the biggest object on screen answered no gesture at all. The mouse is kept out: it has
  // the wheel and the comb already, and dragging would steal hover from the detections.
  const swipeRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    acc: number;
    locked: boolean;
  } | null>(null);

  const onStagePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return;
    swipeRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      acc: 0,
      locked: false,
    };
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.id !== e.pointerId) return;
    const totalX = e.clientX - swipe.startX;
    const totalY = e.clientY - swipe.startY;
    if (!swipe.locked) {
      // Nothing moves until the gesture has made up its mind. Once it turns out vertical it goes to
      // the page entirely: a diagonal begun as a scroll is not the ribbon's to seize.
      if (Math.abs(totalX) < 8 && Math.abs(totalY) < 8) return;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        swipeRef.current = null;
        return;
      }
      swipe.locked = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const step = swipeStep(e.clientX - swipe.lastX, swipe.acc);
    swipe.lastX = e.clientX;
    swipe.acc = step.acc;
    if (step.dir === 0) return;
    // Counted from the last REQUESTED frame, as the wheel is: motion is still travelling, and a
    // long swipe would otherwise mark time.
    const base = targetRef.current ?? current;
    const next = Math.min(photos.length - 1, Math.max(0, base + step.dir));
    targetRef.current = next;
    scrollTo(next, true);
  };

  const endSwipe = () => {
    swipeRef.current = null;
  };

  // Neighbours' full frames are prefetched, or paging leaves the large frame as a blurred
  // thumbnail while the web version travels. The window also stretches to the REQUESTED frame:
  // spinning the wheel outruns three neighbours, and the large frame flashed its placeholder.
  useEffect(() => {
    const ordered = targetRef.current ?? current;
    const from = Math.max(0, Math.min(current, ordered) - PRELOAD_AHEAD);
    const to = Math.min(photos.length - 1, Math.max(current, ordered) + PRELOAD_AHEAD);
    const dying: HTMLImageElement[] = [];
    for (let i = from; i <= to; i += 1) {
      const src = photos[i]?.imageUrl;
      if (!src || readyRef.current.has(src)) continue;
      const img = new Image();
      img.onload = () => {
        readyRef.current.add(src);
        bumpReady((n) => n + 1);
      };
      img.src = mediaUrl(src);
      dying.push(img);
    }
    return () => {
      // On the way out the handlers come off: a frame finishing its load when nobody needs it must
      // not wake a redraw of an unmounted gallery.
      dying.forEach((img) => {
        img.onload = null;
      });
    };
  }, [current, photos]);

  // Arrow keys page the reel. We listen on the window rather than the ribbon: focus is more often
  // on the zoom button or the modal itself, and demanding "click the ribbon first" would hide the
  // control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const base = targetRef.current ?? current;
      const next = Math.min(photos.length - 1, Math.max(0, base + (e.key === "ArrowRight" ? 1 : -1)));
      targetRef.current = next;
      scrollTo(next, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, photos.length, scrollTo]);

  // Hovering and dragging the comb share one handler: the only difference is whether a button is
  // held. While dragging, scrolling is NOT smooth — smoothness would fight the hand, leaving the
  // reel trailing the finger.
  const onCombPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    combXRef.current = e.clientX;
    const index = shapeComb(e.clientX);
    if (index < 0) return;
    movePeek(index, e.clientX - e.currentTarget.getBoundingClientRect().left);
    if (scrubbingRef.current) scrollTo(index, false);
  };

  const onCombPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // otherwise text selection drags and the gesture dies on its first pixel
    targetRef.current = null; // the hand outranks the frame the wheel asked for
    motion.stop();
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    combXRef.current = e.clientX;
    const index = shapeComb(e.clientX);
    if (index >= 0) scrollTo(index, true);
  };

  const onCombPointerLeave = () => {
    scrubbingRef.current = false;
    // The class is set BEFORE the heights come off, and directly rather than through state: the
    // transition must already be in force as they are removed, or the comb would snap shut instead
    // of settling. Waiting for React's redraw is impossible here — it happens afterwards.
    scrubRef.current?.classList.add("is-relaxing");
    combXRef.current = null;
    shapeComb(null);
    if (peekRef.current) peekRef.current.hidden = true;
  };

  const photo = photos[current] ?? photos[0];
  // The frame the reel now stands on goes outwards. The board tile changes its photo because of it
  // (and with it the aspect ratio), so the develop transition returns into the same rectangle
  // instead of stretching a vertical frame across a horizontal card (§7.5).
  useEffect(() => {
    if (photo) onCurrent?.(photo);
  }, [photo, onCurrent]);
  const boxes = photo?.artifacts ?? [];
  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : undefined;
  const zoomRef = useRef<HTMLButtonElement>(null);

  // Which detections are under the cursor — the same mechanics as the mosaic: computed from the
  // point rather than a box's `:hover`, since boxes overlap and only the top one would get it.
  const [under, setUnder] = useState<number[]>([]);
  useEffect(() => setUnder([]), [current]);
  const trackPointer = (e: ReactMouseEvent<HTMLElement>) => {
    if (boxes.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ids = boxesAt(boxes, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height).map(
      (b) => b.artifactId,
    );
    setUnder((cur) => {
      const kept = cur.filter((id) => ids.includes(id));
      const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
      return cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next;
    });
  };

  if (!photo) return null;

  return (
    <div className="drop-roll" ref={rollRef}>
      <div className="drop-roll__hero">
        {/* The scene repeats the frame's proportion: only then do percentage-placed finding boxes
            land where they would on the shot itself. With no dimensions (an old drop from before
            measuring) the scene simply hugs the picture and findings are not drawn. */}
        <span
          className="drop-roll__stage"
          // The scene is "that very frame" for the develop transition (DESIGN §7.5): its bounds
          // match the photo's, because it takes its ratio from it. An attribute, not a class: the
          // seam finds the frame by it in any gallery edition.
          data-morph-hero
          style={ratio ? { aspectRatio: ratio } : undefined}
          onMouseMove={trackPointer}
          onMouseLeave={() => setUnder([])}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
        >
          {/* The thumbnail backs the frame only while the full one is NOT cached. Neighbours are
              preloaded, so while paging it is usually never seen. */}
          {!readyRef.current.has(photo.imageUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img data-morph-face src={mediaUrl(photo.thumbUrl)} alt="" aria-hidden className="drop-roll__thumb" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.imageUrl}
            // The hero's "face" — the layer clipped during the flight (common.css). For a drop that
            // is the photo itself; for the rides map its container plays the part.
            data-morph-face
            src={mediaUrl(photo.imageUrl)}
            alt=""
            decoding="async"
            fetchPriority="high"
            onLoad={() => {
              if (readyRef.current.has(photo.imageUrl)) return;
              readyRef.current.add(photo.imageUrl);
              bumpReady((n) => n + 1);
            }}
            className="drop-roll__photo"
          />
          {ratio && <ArtifactBoxes boxes={boxes} shown={under} />}
          {/* The magnifier sits ON the frame, not in the scene's corner: the button belongs to the
              shot being looked at and moves with it when the proportion changes its size. */}
          <button
            ref={zoomRef}
            type="button"
            className="tap-target drop-roll__zoom"
            onClick={() => onZoom(current, zoomRef.current as HTMLElement)}
            aria-label={`открыть кадр ${current + 1} во весь экран`}
          >
            <Icon name="zoom" size={18} />
          </button>
        </span>
      </div>

      {/* The data strip goes UNDER the frame rather than over it: the shot is looked at whole, and
          there is no reason to cover its bottom with a caption. */}
      <div className="drop-roll__ribbon">
        <span className="drop-roll__no">
          кадр {String(current + 1).padStart(2, "0")} / {photos.length}
        </span>
        {photo.width && photo.height && (
          <span>
            {photo.width} × {photo.height}
          </span>
        )}
        {boxes.length > 0 && <span className="drop-roll__found">находок: {boxes.length}</span>}
      </div>

      <div
        className="drop-roll__strip"
        ref={stripRef}
        style={{ paddingInline: pad }}
        onPointerDown={() => {
          targetRef.current = null;
          motion.stop(); // the hand outranks the requested frame
        }}
      >
        {photos.map((p, i) => {
          const d = Math.abs(i - current);
          return (
            <button
              key={p.imageUrl}
              type="button"
              className={`drop-roll__cell${d === 0 ? " is-current" : d === 1 ? " is-near" : ""}`}
              onClick={() => scrollTo(i, true)}
              aria-label={`кадр ${i + 1}`}
              aria-current={d === 0 ? "true" : undefined}
            >
              {/* `decoding="async"` is not a micro-optimisation: the ribbon opens in the same frame
                  as the developing animation, and a synchronous decode eats its first frames. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(p.thumbUrl)} alt="" loading="lazy" decoding="async" />
            </button>
          );
        })}
      </div>

      {/* The comb: one notch per frame, and the roll's only control. The row responds to the
          cursor approaching, so it announces itself as a control before being touched — which is
          what the separate slider track above it used to be for. */}
      <div
        className="drop-roll__scrub"
        ref={scrubRef}
        onPointerEnter={() => scrubRef.current?.classList.remove("is-relaxing")}
        onPointerDown={onCombPointerDown}
        onPointerMove={onCombPointerMove}
        onPointerUp={() => {
          scrubbingRef.current = false;
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false;
        }}
        onPointerLeave={onCombPointerLeave}
      >
        {photos.map((p, i) => (
          <button
            key={p.imageUrl}
            type="button"
            className={`drop-roll__tick${i === current ? " is-current" : ""}`}
            onClick={() => scrollTo(i, true)}
            aria-label={`перейти к кадру ${i + 1}`}
            aria-current={i === current ? "true" : undefined}
          />
        ))}
        {/* The peek of the frame under the finger. It comes LAST and is positioned absolutely: it
            takes no part in the row of notches but lies over it. */}
        <div className="drop-roll__peek" ref={peekRef} hidden aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={peekImgRef} alt="" />
          <span ref={peekNoRef} />
        </div>
      </div>
    </div>
  );
}
