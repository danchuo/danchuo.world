"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface HoverTipProps {
  /** The tooltip's text. `null` means no tooltip: the anchor renders bare, with no wrapper. */
  text?: string | null;
  /**
   * A CARD tooltip instead of a line of text, placed by the same code as the textual one — the
   * task of popping up near an anchor without falling under the tile's clip is identical. Unlike
   * the text tip it leaves the accessibility tree: it illustrates the anchor, it does not describe
   */
  content?: ReactNode;
  /**
   * A PHRASE tooltip rather than a short line: it wraps by words and is capped by width. By default
   * a tooltip is one line (`nowrap`), as its SVG sibling at the streak flame intended, where the
   * text is short — a day-of-life number, a streak length.
   */
  phrase?: boolean;
  /**
   * Makes the anchor fill its cell instead of sizing to content. Needed wherever the wrapped child
   * stretches, because the wrapper appears WITH the tooltip, that is, with the data — and
   * `inline-block` would collapse a stretched child exactly when the data arrived.
   */
  fill?: boolean;
  children: ReactNode;
}

/** The gap between anchor and tooltip, and its inset from the screen edge. */
const GAP = 4;
const EDGE = 8;
/**
 * Delay before hiding the card. It is precisely about [GAP]: an empty strip lies between anchor and
 * card, and a pointer travelling onto the card passes outside both. Hiding at once made the card's
 * links unreachable — there was physically no way to get to them.
 */
const LEAVE_MS = 220;

/**
 * Closes the open card — there is only ever one on the board. WITHOUT THIS the leave delay becomes
 * a visible fault: moving between adjacent marks opens the new card while the old one sits out its
 * delay, and both are briefly stacked. A module variable, since the state is shared by nature.
 */
let closeOpenCard: (() => void) | null = null;

/**
 * A tooltip styled as a mini tile, the HTML twin of the quest map's SVG tip. It LIVES IN A PORTAL
 * with `position: fixed`, and that is load-bearing: a tile clips its content and cannot stop, and
 * `.pixel-tile` carries a `filter`, which would make it the containing block. DESIGN §12
 */
export function HoverTip({ text, content, phrase = false, fill = false, children }: HoverTipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  // A card opened by a TAP: touch has no hover, so it stays until a tap outside. DESIGN §7.9
  const [pinned, setPinned] = useState(false);
  const lastPointer = useRef<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // The portal exists only on the client: there is no `document` on the server, and a hydration
  // mismatch costs more than a tooltip appearing one frame later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!a || !t) return;
    const ar = a.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    // Below the anchor when it fits, otherwise above. The SCREEN decides, not the tile: out of the
    // portal nothing clips the hint any more.
    const below = ar.bottom + GAP + tr.height <= window.innerHeight - EDGE;
    const top = below ? ar.bottom + GAP : ar.top - GAP - tr.height;
    // Horizontally it starts from the anchor's left edge but is not allowed off the screen.
    const maxLeft = window.innerWidth - EDGE - tr.width;
    const left = Math.max(EDGE, Math.min(ar.left, maxLeft));
    setPos({ top, left });
  }, []);

  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopLeaving = useCallback(() => {
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
  }, []);

  const hide = useCallback(() => {
    stopLeaving();
    setOpen(false);
    setPinned(false);
  }, [stopLeaving]);
  const show = useCallback(() => {
    stopLeaving();
    place();
    setOpen(true);
    // There is one card on the board: opening yours closes the other immediately, without waiting for
    // its delay (see [closeOpenCard]). Text hints take no part in the registry — they are instant and
    // never manage to overlap each other.
    if (content) {
      if (closeOpenCard && closeOpenCard !== hide) closeOpenCard();
      closeOpenCard = hide;
    }
  }, [content, hide, place, stopLeaving]);
  /** Leaving a card's anchor is not an order to hide but the start of a delay: see [LEAVE_MS]. */
  const hideSoon = useCallback(() => {
    stopLeaving();
    leaving.current = setTimeout(() => setOpen(false), LEAVE_MS);
  }, [stopLeaving]);

  useEffect(() => stopLeaving, [stopLeaving]);
  // On the way out we deregister: holding a closer for an unmounted card serves nothing.
  useEffect(() => () => {
    if (closeOpenCard === hide) closeOpenCard = null;
  }, [hide]);

  // A pinned card closes on a tap anywhere but itself and its mark; the mark's own tap toggles it.
  useEffect(() => {
    if (!open || !pinned) return;
    const onDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (anchorRef.current?.contains(target) || tipRef.current?.contains(target))) return;
      hide();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, pinned, hide]);

  // The screen has scrolled or changed, so the hint hides rather than hanging detached from its anchor.
  // A pinned card waits for its tap outside instead: scrolling inside it must not close it.
  useEffect(() => {
    if (!open || pinned) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, pinned, hide]);

  if (!text && !content) return <>{children}</>;

  /** Touch drives a card by taps alone; the enter, leave and focus around a tap are ignored. */
  const byTouch = (e?: PointerEvent) => !!content && (e ? e.pointerType === "touch" : lastPointer.current === "touch");
  const onTap = (e: MouseEvent) => {
    if (!byTouch()) return;
    // The mark sits in a link: the first tap shows the card instead of leaving the site.
    e.preventDefault();
    if (open) {
      hide();
    } else {
      show();
      setPinned(true);
    }
  };

  const tip = content ? (
    <span
      ref={tipRef}
      className="hover-tip hover-tip--card"
      aria-hidden="true"
      data-open={open ? "true" : undefined}
      onPointerEnter={(e) => byTouch(e) || show()}
      onPointerLeave={(e) => byTouch(e) || hide()}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      {content}
    </span>
  ) : (
    <span
      ref={tipRef}
      className={`hover-tip${phrase ? " hover-tip--phrase" : ""}`}
      id={id}
      role="tooltip"
      data-open={open ? "true" : undefined}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      {text}
    </span>
  );

  return (
    <>
      <span
        ref={anchorRef}
        className={`hover-tip-anchor${fill ? " hover-tip-anchor--fill" : ""}`}
        aria-describedby={content ? undefined : id}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          lastPointer.current = e.pointerType;
          if (!byTouch(e)) show();
        }}
        onPointerLeave={(e) => byTouch(e) || (content ? hideSoon() : hide())}
        onFocus={() => byTouch() || show()}
        onBlur={() => pinned || hide()}
        onClick={onTap}
      >
        {children}
      </span>
      {mounted && typeof document !== "undefined" ? createPortal(tip, document.body) : null}
    </>
  );
}
