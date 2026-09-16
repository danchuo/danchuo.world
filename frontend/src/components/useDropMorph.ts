"use client";

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cssDurationMs, morphClip, morphRadius, morphTransform } from "@/lib/dropMorph";

/**
 * Duration of the develop transition when the skin has not named one. The number here is only a
 * fallback: the real value arrives from `--drop-morph-ms`, because that same value drives the
 * frame's own transition and the two must never diverge, or the gallery unmounts mid-flight.
 */
const FALLBACK_MS = 560;

/**
 * The DEVELOP transition — a shared seam, not part of any one wave: the mechanics live here and a
 * wave opts in from its skin. A gallery frame pretends to be the tile's frame and flies out of it;
 * JS gives geometry, CSS everything else, so there is no visual number here. DESIGN §7.5
 */

/**
 * Cap on measurement attempts, in rendered frames. A third of a second is enough for the ribbon to
 * settle and the gallery to lay out, while a missing hero cannot turn into an endless rAF loop.
 */
const MAX_PLAY_RETRIES = 40;

/** How long to wait for the gallery's first frame before showing it with no movement at all. */
const WAIT_CAP_MS = 500;

export function useDropMorph({
  origin,
  sceneRef,
  onClose,
}: {
  /** The board frame the gallery grows from; absent means there is nothing to morph from. */
  origin?: RefObject<HTMLElement | null>;
  /** The gallery layer as a whole: it carries `data-morph`, which dresses the entire scene. */
  sceneRef: RefObject<HTMLElement | null>;
  /** Unmount the gallery — called AFTER the reverse transition. */
  onClose: () => void;
}): {
  /** Play the transition; repeat calls are ignored, the frame being in place already. */
  playIn: () => void;
  /** Close the gallery: in reverse when the transition exists, immediately when it does not. */
  requestClose: () => void;
} {
  const playedRef = useRef(false);
  /** How many more times to try measuring before accepting there is nothing to morph from. */
  const retriesRef = useRef(0);
  /**
   * Reference to the current [playIn], through which a retry calls ITSELF. Direct recursion inside
   * `useCallback` is impossible: a function cannot stand in its own dependency list.
   */
  const playInRef = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);
  /** Deferred start of the movement (see [playIn]); 0 means nothing is scheduled. */
  const frameRef = useRef(0);
  /** The tile the frame was taken from: it must return to the board however the gallery ends. */
  const hiddenRef = useRef<HTMLElement | null>(null);
  /** The frame's images are decoded, so the flight can be released (see [heroPaintable]). */
  const paintableRef = useRef(false);
  /** A decode has already been requested — do not ask twice. */
  const decodingRef = useRef(false);

  const showSource = useCallback(() => {
    hiddenRef.current?.removeAttribute("data-morph-source");
    hiddenRef.current = null;
  }, []);

  const cancelStart = useCallback(() => {
    if (!frameRef.current) return false;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    return true;
  }, []);

  // The gallery may be removed without closing (a wave change, leaving the page), and the tile must
  // not stay invisible because of an animation that no longer exists.
  useEffect(
    () => () => {
      cancelStart();
      showSource();
    },
    [cancelStart, showSource],
  );

  /**
   * Whether a develop transition will happen at all, WITHOUT the gallery frame, which does not
   * exist on the first render. It is needed separately because the gallery loads its frames: unless
   * the scene is marked as waiting AT ONCE, the viewer sees a panel with no photo in it.
   */
  const morphPossible = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!sceneRef.current || !origin?.current) return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return getComputedStyle(document.documentElement).getPropertyValue("--drop-morph").trim() === "1";
  }, [origin, sceneRef]);

  // Mark the scene as waiting BEFORE the first paint, hence a layout effect. It is also cleared by
  // a timer if motion never starts: waiting hides the gallery entirely, so without a cap a slow
  // answer would mean a click after which NOTHING happens.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || scene.dataset.morph || !morphPossible()) return;
    scene.dataset.morph = "wait";
    const timer = window.setTimeout(() => {
      if (scene.dataset.morph !== "wait") return;
      delete scene.dataset.morph;
      playedRef.current = true;
    }, WAIT_CAP_MS);
    return () => window.clearTimeout(timer);
  }, [morphPossible, sceneRef]);

  /** Layer, gallery frame and tile frame at once — either all three exist or there is no morph. */
  const parts = useCallback(() => {
    const scene = sceneRef.current;
    const hero = scene?.querySelector<HTMLElement>("[data-morph-hero]") ?? null;
    const tile = origin?.current ?? null;
    if (!scene || !hero || !tile) return null;
    // Measure the frame but hide the CARD: the geometry belongs to the photo while the whole tile
    // must vanish, or an empty border is left where a picture was. It must be `.pixel-tile` and not
    // the board cell — the gallery lives inside the same tile, and opacity there hides it too.
    const card = tile.closest<HTMLElement>(".pixel-tile") ?? tile;
    // The wave's opt-in is read from computed style, being declared in the skin rather than inline.
    // Reduced motion cancels the transition entirely: this is movement across half a screen, and
    // there is nothing here to soften.
    if (typeof window === "undefined") return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    const root = getComputedStyle(document.documentElement);
    if (root.getPropertyValue("--drop-morph").trim() !== "1") return null;
    // Two durations, in and out; out is shorter, the frame travelling a road it already knows. They
    // are parsed with their unit ([cssDurationMs]) because the build rewrites `320ms` as `.32s`, and
    // a naive `parseInt` would substitute the default — CSS playing one duration, timers another.
    const read = (name: string) => cssDurationMs(root.getPropertyValue(name));
    const ms = read("--drop-morph-ms") ?? FALLBACK_MS;
    return {
      scene,
      hero,
      tile,
      card,
      ms,
      outMs: read("--drop-morph-out-ms") ?? ms,
      // Settling: the frame is home and still but still held, with the tile's band and caption showing
      // through it. A skin may not ask for it, in which case the gallery is removed at once.
      settleMs: read("--drop-morph-settle-ms") ?? 0,
    };
  }, [origin, sceneRef]);

  /**
   * Place the frame within the tile's bounds, both transform and rounding. The rounding is computed
   * from the CARD (its border draws it) minus the border itself, since what clips the picture is the
   * frame's inner edge, not its outer one.
   */
  const placeOnTile = useCallback((p: NonNullable<ReturnType<typeof parts>>) => {
    const tileBox = p.tile.getBoundingClientRect();
    const heroBox = p.hero.getBoundingClientRect();
    const at = morphTransform(tileBox, heroBox);
    if (!at) return false;
    p.scene.style.setProperty("--drop-morph-from", at);
    const edge = getComputedStyle(p.card);
    const radius = Math.max(
      0,
      Number.parseFloat(edge.borderTopLeftRadius) - Number.parseFloat(edge.borderTopWidth),
    );
    const r = Number.isFinite(radius) ? morphRadius(tileBox, heroBox, radius) : null;
    if (r) p.scene.style.setProperty("--drop-morph-radius-from", r);
    // The clip partners the uniform scale: the frame travels whole and lands in the tile cropped top
    // and bottom, exactly as the tile itself shows it (`object-fit: cover`).
    const clip = morphClip(tileBox, heroBox, Number.isFinite(radius) ? radius : 0);
    if (clip) p.scene.style.setProperty("--drop-morph-clip-from", clip);
    return true;
  }, []);

  /**
   * Whether the frame is ready to PAINT — not whether it is in the markup, but whether its pixels
   * are decoded. Without this the flight began exactly as the browser started decoding and simply
   * did not draw its first third (measured: 17-20 frames of 27, versus 26-27 when decoded).
   */
  const heroPaintable = useCallback((hero: HTMLElement) => {
    if (paintableRef.current) return true;
    const imgs = Array.from(hero.querySelectorAll("img"));
    if (imgs.length === 0) return true;
    if (!imgs.every((img) => img.complete && img.naturalWidth > 0)) return false;
    if (decodingRef.current) return false;
    decodingRef.current = true;
    // `complete` says the file has arrived, not that the pixels are ready: decoding of large frames is
    // deferred (`decoding="async"`) and falls precisely on the first frames of the flight. `decode` is
    // not available everywhere (jsdom, older engines), where `complete` has to do.
    const ready = imgs.map((img) =>
      typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve(),
    );
    Promise.all(ready).then(() => {
      paintableRef.current = true;
      playInRef.current?.();
    });
    return false;
  }, []);

  const playIn = useCallback(() => {
    if (playedRef.current) return;
    const p = parts();
    // Nothing to measure yet — try again next frame. The retry is not for accuracy but because
    // there is often nothing there: the ribbon's gallery opens after winding and loads frames after
    // the click. Giving up on the first failure would leave only the top drop with any motion.
    if (!p || !heroPaintable(p.hero) || !placeOnTile(p)) {
      if (retriesRef.current >= MAX_PLAY_RETRIES) {
        // Given up: the gallery shows as it is, with no movement. The waiting flag is cleared, or the
        // frame would stay invisible for good.
        if (sceneRef.current?.dataset.morph === "wait") delete sceneRef.current.dataset.morph;
        return;
      }
      // The waiting flag is usually set at mount; it is set here too, for the case where the transition
      // became possible later (the tile appeared on the board after the gallery opened).
      if (p?.scene && !p.scene.dataset.morph) p.scene.dataset.morph = "wait";
      retriesRef.current += 1;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        playInRef.current?.();
      });
      return;
    }
    playedRef.current = true;
    // The starting frame is set WITHOUT a transition, and motion is released only once the browser
    // has PAINTED it. The double rAF is the price of that first paint being heavy: the transition
    // timeline runs on wall clock, so starting earlier leaves it nearly over by the first frame.
    p.scene.dataset.morph = "from";
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        p.scene.dataset.morph = "in";
        // The frame has left for the gallery, so its tile is no longer on the board.
        p.card.dataset.morphSource = "on";
        hiddenRef.current = p.card;
      });
    });
  }, [heroPaintable, parts, placeOnTile]);
  playInRef.current = playIn;

  const requestClose = useCallback(() => {
    if (leavingRef.current) return;
    const p = parts();
    // Closed before the movement began (the frame still stands on its tile) leaves nothing to play
    // back. The same when there was no transition at all — another wave, the mosaic, reduced motion:
    // it closes as it always did.
    const notStarted = cancelStart();
    if (!p || !playedRef.current || notStarted) {
      showSource();
      onClose();
      return;
    }
    if (!placeOnTile(p)) {
      showSource();
      onClose();
      return;
    }
    leavingRef.current = true;
    p.scene.dataset.morph = "out";
    // The tile fades back in towards the END of the movement rather than after it: 150ms before
    // landing the frame is nearly in place and covers the substitution itself.
    window.setTimeout(showSource, Math.max(0, p.outMs - 150));
    // The gallery is removed after the settling rather than at landing: the frame already stands
    // exactly in the tile and dissolves into it, letting the caption band show through. Snapping it
    // away would reveal them in one jerk — the only thing the tile has that the frame does not.
    window.setTimeout(onClose, p.outMs + p.settleMs);
  }, [cancelStart, onClose, parts, placeOnTile, showSource]);

  return { playIn, requestClose };
}
