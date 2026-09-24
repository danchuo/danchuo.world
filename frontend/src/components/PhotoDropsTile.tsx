"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getDrops } from "@/lib/api/client";
import { photoUrl } from "@/lib/api/media";
import {
  CAROUSEL_MOTION_RATE,
  CAROUSEL_OPEN_RATE,
  CAROUSEL_OPEN_WAIT_MS,
  CAROUSEL_RADIUS_PX,
  CAROUSEL_SLOT_PX,
  slotLook,
  startSlotIndex,
} from "@/lib/dropCarousel";
import { ROLL_SETTLE_PX, nearestFrameIndex, stripPadding, wheelStep } from "@/lib/dropRoll";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useRollMotion } from "./useRollMotion";
import { useSidewaysWheel } from "./useSidewaysWheel";
import { useTileData } from "./useTileData";

interface PhotoDropsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Content flow (DESIGN §10.1): "horizontal" — a strip of cover cards with titles below
   * (readable, no truncation to nothing); "vertical" (default) — the compact list of rows.
   */
  orientation?: TileOrientation;
  /**
   * The rail's layout (DESIGN §7.5), chosen by the WAVE through `tiles.photoDrops.edition`:
   * unset or unknown gives the former rails, governed by [orientation]; `carousel` gives the archive
   * carousel, where the frame in the middle of the window is large and distant ones fade into canvas.
   */
  edition?: string;
  /** Gallery edition from the wave's layout (see [PhotoDropModal]). */
  gallery?: string;
}

/** An unknown edition name falls back to the default: the set of editions is the tile's knowledge,
 *  not the layout registry's. */
function resolveEdition(value: string | undefined): "carousel" | "default" {
  return value === "carousel" ? "carousel" : "default";
}

/**
 * The compact ribbon of photo drops, newest on the left, a click opening the gallery. THE RIBBON
 * IS THE ARCHIVE — there is no separate page — while [LatestDropTile] shows the newest one large.
 * Before the first upload it is a quiet empty. PRD §5.12, DESIGN §7.5
 */
export function PhotoDropsTile({
  style,
  className,
  orientation = "vertical",
  edition: editionRaw,
  gallery,
}: PhotoDropsTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, retry } = useTileData<FilmDropView[]>(
    useCallback((signal) => getDrops({ signal }), []),
    "drops",
  );
  const drops = data ?? [];
  const isEmpty = phase === "loaded" && drops.length === 0;
  const [openDrop, setOpenDrop] = useState<FilmDropView | null>(null);
  // A carousel is vertical by nature, so it outranks orientation: a wave that forgot to drop
  // `orientation: horizontal` must not end up with a rail inside a column.
  const carousel = edition === "carousel";
  const horizontal = !carousel && orientation === "horizontal";
  // The shelf has no scrollbar: the wheel moves it sideways. DESIGN §7.5
  const shelfRef = useSidewaysWheel<HTMLUListElement>();
  const reelRef = useRef<HTMLUListElement>(null);
  /**
   * Carousel movement, the same seam as the reel's. Native smooth scrolling bogged down on fast
   * wheeling: each click interrupted an animation still running and recomputed the origin from the
   * ribbon's live position, which was on a frame it would already have passed.
   */
  const motion = useRollMotion(reelRef, "y", CAROUSEL_MOTION_RATE);
  /** The rail has already been set to its starting frame: resize and new data no longer move it. */
  const startedRef = useRef(false);
  // A leaving edition is the END of the ribbon's life, not a pause. The tile does not unmount when
  // the wave changes and the nodes are reused, so without a reset the returning carousel found
  // scroll at zero and showed the wrong drop. Keyed on the edition, not on data arriving.
  useEffect(() => {
    if (!carousel) startedRef.current = false;
  }, [carousel]);
  // The tile the gallery grows from: the develop transition needs the exact frame that was clicked.
  const originRef = useRef<HTMLElement | null>(null);
  /**
   * The frame a drop's gallery was closed on. It exists so the develop transition returns to the
   * frame you leave from rather than the one you entered by. It lives in tab memory: a reload
   * silently restores the owner's chosen cover, which is correct rather than forgetful. §7.5
   */
  const [viewed, setViewed] = useState<Record<number, FilmPhotoView>>({});
  /**
   * The first cover has arrived. Until then the rail is not drawn at all: with the slab removed by a
   * wave's skin, an empty scaffold read as a flickering rectangle on the canvas during a hard reload.
   * On later loads the data is already cached and the rail has nothing to wait for.
   */
  const [coversReady, setCoversReady] = useState(false);
  /**
   * Cover readiness is read from the NODE as well as from `load`, because that event may never
   * fire: changing the wave swaps the edition while React reuses the same nodes and `src`, so
   * there is no second `load` and the ribbon stayed blank until a page reload.
   */
  const markCoverReady = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setCoversReady(true);
  }, []);
  // Which drop stands in the middle of the window: that one is "current" for accessibility. An index
  // rather than an id — position in the rail IS the answer here, and it changes with scrolling.
  const [centered, setCentered] = useState(0);

  // Carousel: each slot's look is a pure function of its distance from the window's centre.
  // Computed imperatively through refs rather than per-frame state — layout does not depend on it,
  // and redrawing React sixty times a second for two CSS properties is not worth it.
  useEffect(() => {
    const el = reelRef.current;
    if (!el || !carousel) return;

    // Side padding of the ribbon: without it the OUTERMOST drops are unreachable, as the window's
    // centre lands half a window in from the edge. It is computed from `clientHeight`, so the
    // ribbon MUST get its height from the parent — sized by content, the padding fed itself.
    const layout = () => {
      const pad = stripPadding(el.clientHeight, CAROUSEL_SLOT_PX);
      el.style.paddingBlock = `${pad}px`;
    };

    /**
     * The first render sets the rail to the SECOND drop: above the first there is only empty side
     * padding, so the archive reads as the start of a list rather than a carousel. Once per rail
     * lifetime — a resize or new data must not drag the viewer off the frame they chose.
     */
    const start = () => {
      if (startedRef.current) return;
      const index = startSlotIndex(el.children.length);
      if (!el.children[index] || el.clientHeight <= 0) return;
      startedRef.current = true;
      motion.jump(index);
    };

    const paint = () => {
      const box = el.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const centers: number[] = [];
      for (const node of Array.from(el.children)) {
        const li = node as HTMLElement;
        const rect = li.getBoundingClientRect();
        // Scale keeps a slot's centre in place (`transform-origin` defaults to the middle), so
        // measuring by it does not chase itself: the centre does not depend on its own scale.
        const center = rect.top + rect.height / 2;
        centers.push(center);
        const look = slotLook(center - mid, CAROUSEL_RADIUS_PX);
        li.style.transform = `scale(${look.scale})`;
        li.style.opacity = String(look.opacity);
        // Defocusing distant frames also hides the hard cut of the fourth and fifth frame by the
        // tile's edge on tall screens: a blurred frame no longer has a sharp boundary.
        li.style.filter = look.blur > 0.01 ? `blur(${look.blur.toFixed(2)}px)` : "";
        li.style.zIndex = String(look.zIndex);
      }
      if (centers.length > 0) setCentered(nearestFrameIndex(centers, mid));
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        paint();
      });
    };

    // The ribbon handles the wheel ITSELF rather than leaving it to the browser: one click is
    // exactly one drop, always. Browser scrolling fought the snap. The NEXT frame is counted from
    // the requested one, not from what sits in the centre now, or a chain of clicks marks time.
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const down = e.deltaY > 0;
      const ordered = motion.target();
      const last = el.children.length - 1;
      const atStart = ordered === null ? el.scrollTop <= 0 : ordered <= 0;
      const atEnd = ordered === null ? el.scrollTop >= max - 1 : ordered >= last;
      if ((!down && atStart) || (down && atEnd)) return;
      const step = wheelStep(e.deltaX, e.deltaY, e.deltaMode, acc);
      acc = step.acc;
      e.preventDefault();
      if (step.dir === 0) return;
      const box = el.getBoundingClientRect();
      const from = ordered ?? nearestFrameIndex(
        Array.from(el.children).map((node) => {
          const r = (node as HTMLElement).getBoundingClientRect();
          return r.top + r.height / 2;
        }),
        box.top + box.height / 2,
      );
      motion.to(Math.min(last, Math.max(0, from + step.dir)));
    };

        // A hand outranks the frame the wheel asked for: while the rail travels by itself, a finger
        // would be fighting it for the same scroll (on touch the carousel pages by the native gesture).
    const onTouch = () => motion.stop();

    layout();
    start();
    paint();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouch, { passive: true });
    // ResizeObserver keeps the measurements alive (window resize, a change of wave or layout). In
    // jsdom there is none, so the rail keeps its first painting — which is exactly what tests check.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      layout();
      // The measurement may only have arrived now (in the stack the rail gets its height after the
      // first layout), so the starting frame is set here and `start` stays silent afterwards.
      start();
      paint();
    });
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
      motion.stop();
      ro?.disconnect();
      // Erase EVERYTHING this effect wrote into the markup. React did not set these inline styles
      // and will not remove them: changing the wave swaps the edition while the nodes stay in
      // place, so the old ribbon kept the carousel's scale, opacity and padding.
      el.style.paddingBlock = "";
      for (const node of Array.from(el.children)) {
        const li = node as HTMLElement;
        li.style.transform = "";
        li.style.opacity = "";
        li.style.filter = "";
        li.style.zIndex = "";
      }
    };
  }, [carousel, motion, phase, drops.length]);

  /**
   * Opens a drop from the carousel, first winding an off-centre frame to the middle: the develop
   * transition grows out of a frame, and it must grow from where the viewer is looking. The wind
   * runs at its own, brisker rate and hands over almost at once — the choice is already made.
   */
  const openFromReel = (drop: FilmDropView, card: HTMLElement) => {
    originRef.current = card;
    const reel = reelRef.current;
    const slot = card.closest("li");
    if (!reel || !slot) {
      setOpenDrop(drop);
      return;
    }
    const offset = () => {
      const box = reel.getBoundingClientRect();
      const r = slot.getBoundingClientRect();
      return r.top + r.height / 2 - (box.top + box.height / 2);
    };
    if (Math.abs(offset()) <= ROLL_SETTLE_PX) {
      setOpenDrop(drop);
      return;
    }
    motion.to(Array.from(reel.children).indexOf(slot), CAROUSEL_OPEN_RATE);
    // Wait for the rail to arrive. A time ceiling is mandatory: for the OUTERMOST frame the target is
    // clamped by maximum scroll and it never reaches the middle of the window, so without one a click
    // on the rail's edge would never open its drop.
    const startedAt = performance.now();
    const settle = () => {
      if (Math.abs(offset()) <= ROLL_SETTLE_PX * 3 || performance.now() - startedAt > CAROUSEL_OPEN_WAIT_MS) {
        setOpenDrop(drop);
        return;
      }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  };

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="пока нет дропов"
        onRetry={retry}
        label="дропы"
        ariaLabel="Фото-дропы"
        style={style}
        className={className}
      >
        {phase === "loaded" && !isEmpty && (carousel ? (
          // The archive carousel: frames travel a vertical ribbon and the one in the window's
          // centre is the main one. SCROLL IS THE CONTROL — hover plays no part in layout, so the
          // ribbon never twitches under the cursor, at three drops or three hundred alike.
          <ul
            ref={reelRef}
            className={`drop-carousel scroll-invisible tile-frame${coversReady ? " is-ready" : ""}`}
          >
            {drops.map((d, i) => {
              // A drop's cover is the frame its gallery was closed on; before the first visit and
              // after a page reload it is the cover the owner chose.
              const cover = viewed[d.id]?.thumbUrl ?? d.coverPhotoUrl;
              return (
              <li key={d.id} className="drop-carousel__slot">
                <button
                  type="button"
                  onClick={(e) => openFromReel(d, e.currentTarget)}
                  className="drop-carousel__card"
                  aria-current={i === centered ? "true" : undefined}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(cover)}
                      alt=""
                      className="drop-carousel__cover"
                      ref={markCoverReady}
                      onLoad={() => setCoversReady(true)}
                      // A broken cover does not lock the rail: whatever exists is shown.
                      onError={() => setCoversReady(true)}
                    />
                  ) : (
                    <span aria-hidden className="drop-carousel__cover drop-carousel__cover--blank" />
                  )}
                  <span className="drop-carousel__label">
                    <span className="t-drops-title drop-carousel__title" title={d.title}>
                      {d.title}
                    </span>
                    <span className="t-drops-month drop-carousel__month">{d.monthLabel ?? ""}</span>
                  </span>
                </button>
              </li>
              );
            })}
          </ul>
        ) : horizontal ? (
          // Horizontal strip: big cover cards with the title underneath. Extra drops scroll
          // sideways; no visible scrollbar — the cut-off card at the edge is the affordance.
          <ul
            ref={shelfRef}
            className="scroll-invisible tile-frame flex h-full items-stretch gap-3 overflow-x-auto overflow-y-hidden"
          >
            {drops.map((d) => (
              <li key={d.id} className="flex h-full min-w-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenDrop(d)}
                  className="flex h-full min-h-0 flex-col gap-1 text-left"
                  // Card width tuned so a sliver of the next card peeks out at the tile edge —
                  // the visible cut-off is the affordance that the strip scrolls sideways.
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: 84 }}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {d.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(d.coverPhotoUrl)}
                      alt=""
                      className="min-h-0 w-full flex-1"
                      style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <span aria-hidden className="min-h-0 w-full flex-1" style={{ background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
                  )}
                  <span
                    className="t-drops-title w-full"
                    style={{
                      lineHeight: 1.25,
                      color: "var(--text-secondary)",
                      // Two-line clamp: readable titles are the whole point of the horizontal
                      // strip — a one-line ellipsis ate half of every title.
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={d.title}
                  >
                    {d.title}
                  </span>
                  <span className="t-drops-month" style={{ fontFamily: "var(--font-mono)", lineHeight: 1.2, color: "var(--text-tertiary)" }}>
                    {d.monthLabel ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // The vertical list pages by the same gesture and WITHOUT a scrollbar, like the shelf above:
          // a grey strip over the covers read as an interface element rather than a hint
          // (`scroll-invisible` in common.css; wheel and trackpad scrolling stay).
          <ul className="scroll-invisible tile-frame flex h-full flex-col gap-1.5 overflow-y-auto">
            {drops.map((d) => (
              <li key={d.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpenDrop(d)}
                  className="flex w-full items-center gap-2 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {d.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(d.coverPhotoUrl)}
                      alt=""
                      width={32}
                      height={32}
                      style={{ flexShrink: 0, width: 32, height: 32, objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <span aria-hidden style={{ flexShrink: 0, width: 32, height: 32, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
                  )}
                  <span className="t-drops-title min-w-0 flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                    {d.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </TileShell>

      {openDrop && (
        <PhotoDropModal
          dropId={openDrop.id}
          title={openDrop.title}
          monthLabel={openDrop.monthLabel}
          gallery={gallery}
          // Develop transition: the gallery grows out of the rail frame that was clicked and returns
          // into it. The same seam as the latest-drop tile, since the component is one.
          origin={originRef}
          // The first visit opens on the drop's COVER, the frame shown on the rail card: a click asks
          // about the frame being looked at, not about the start of the film. Afterwards its place is
          // taken by whichever frame the gallery was closed on.
          startAt={viewed[openDrop.id]?.imageUrl ?? openDrop.coverPhotoUrl}
          onFrameShown={(photo) => setViewed((v) => ({ ...v, [openDrop.id]: photo }))}
          onClose={() => setOpenDrop(null)}
        />
      )}
    </>
  );
}
