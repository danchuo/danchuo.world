"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getArtifacts } from "@/lib/api/client";
import { ARTIFACT_SIZE, artifactBox } from "@/lib/artifactBox";
import { shaftArtifacts, type ShaftArtifact } from "@/lib/artifactShaft";
import type { ArtifactView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { ArtifactModal } from "./ArtifactModal";
import { ArtifactShaft } from "./ArtifactShaft";
import { Icon } from "./Icon";
import { TileShell } from "./TileShell";
import { useBackToClose } from "./useBackToClose";
import { useScrollLock } from "./useScrollLock";
import { useMarqueeDrag } from "./useMarqueeDrag";
import { useTileData } from "./useTileData";

/* `useLayoutEffect` warns during server rendering of a client component, so on the server we
   fall back to a plain effect (the same device as in [MusicTile]). */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ArtifactMarqueeProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Direction of the ribbon, set by the wave through its layout. `vertical` is a column travelling
   * upwards; the default is a horizontal row. DESIGN §10.1
   */
  orientation?: TileOrientation;
  /**
   * The tile's edition, set by the wave. `shaft` stands the artifacts' pictures in a receding
   * line; the default is the flat ribbon. DESIGN §7.2, §10.1
   */
  edition?: string;
}

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** "2026-01-15" to a long Russian date, parsed by parts so `new Date` cannot shift the timezone. */
function formatFirstMentioned(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS[m - 1]} ${y}`;
}

/**
 * An item in the ribbon; its aspect ratio is measured from the image on load. ACROSS the ribbon
 * the slot is always one size with the item centred — items are matched by optical weight, so
 * their heights differ and captions would otherwise jump. Along it, the slot fits the item.
 */
function ArtifactThumb({
  src,
  alt,
  vertical,
  rotatable,
}: {
  src: string;
  alt: string;
  vertical: boolean;
  rotatable: boolean;
}) {
  const [ratio, setRatio] = useState(0);
  const box = artifactBox(ratio, vertical, rotatable);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: vertical ? ARTIFACT_SIZE : box.width,
        height: vertical ? box.height : ARTIFACT_SIZE,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
        }}
        style={{
          width: box.rotate ? box.height : box.width,
          height: box.rotate ? box.width : box.height,
          objectFit: "contain",
          transform: box.rotate ? "rotate(90deg)" : undefined,
        }}
      />
    </span>
  );
}

/**
 * The artifact ribbon: items with captions, a click opening a card. It scrolls ONLY when the items
 * overflow the tile, in which case the content is duplicated for a seamless loop — one or two
 * items must not be doubled, or a phantom copy peeks in on zoom-out. PRD §5.8, DESIGN §7.2
 */
export function ArtifactMarquee({ style, className, orientation = "horizontal", edition }: ArtifactMarqueeProps) {
  // An unknown edition name means the default: the set of editions is the TILE's knowledge.
  const shaft = edition === "shaft";
  const vertical = orientation === "vertical";
  const { phase, data, retry } = useTileData<ArtifactView[]>(
    useCallback((signal) => getArtifacts({ signal }), []),
    "artifacts",
  );
  const all = data ?? [];
  // The shaft shows only things that brought a picture; the flat ribbon shows everything.
  const shaftItems: ShaftArtifact[] = shaft ? shaftArtifacts(all) : [];
  const artifacts: ArtifactView[] = shaft ? shaftItems : all;
  const isEmpty = phase === "loaded" && artifacts.length === 0;
  const [active, setActive] = useState<number | null>(null);

  /* The nodes are STATE, not refs: a wave dressing the tile as a shaft tears the ribbon out and
     builds it anew, and a ref change wakes no effect — the listeners stayed on the detached nodes
     and the ribbon froze on the way back. DESIGN §10.1 */
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [scrolling, setScrolling] = useState(false);
  /** The loop's step — the size of ONE copy of the content. Dragging is measured by it too. */
  const [span, setSpan] = useState(0);

  /* The measurement runs SYNCHRONOUSLY after commit, not on the next tick: before it `span` is
     zero, and a zero loop step means "the ribbon fits" — so travel, dragging and the wheel all do
     nothing. One missed frame is invisible, but a gesture caught in that gap is lost. */
  useIsomorphicLayoutEffect(() => {
    if (!box || !track) return;
    const measure = () => {
      // Once duplicated, one copy's natural size is half the track.
      const factor = scrolling ? 2 : 1;
      const content = (vertical ? track.scrollHeight : track.scrollWidth) / factor;
      const avail = vertical ? box.clientHeight : box.clientWidth;
      const over = content > avail + 1;
      setScrolling(over);
      setSpan(over ? content : 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom tests have no ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(track);
    return () => ro.disconnect();
    /* `phase` is in the dependencies for a reason: content renders only in the `loaded` state, and
       before that neither ref exists, so the effect returns early. Without it the effect would
       never re-run when the ribbon's contents happened to stay the same. */
  }, [box, track, vertical, scrolling, artifacts.length, phase]);

  // The system Back closes the menu instead of leaving the site (DESIGN §9).
  useBackToClose(active !== null, () => setActive(null));
  useScrollLock(active !== null);

  // The menu is a centred modal; Esc closes it (backdrop and repeat clicks are handled below).
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Pace follows the number of artifacts but never beats 20s, so it reads rather than flickers.
  const seconds = Math.max(20, artifacts.length * 6);
  // Own travel, hand dragging and wheel are ONE mechanism (§7.2): all three move the same offset,
  // so the ribbon continues from wherever it was left.
  const marquee = useMarqueeDrag({ track, container: box, span, vertical, seconds });
  const activeArtifact = active !== null ? artifacts[active] : null;
  /* The same index in the shaft's own list: it carries the picture, so the card takes it from here
     rather than re-deriving a thing's address from a list that may not hold it. */
  const activeShaftItem = active !== null ? shaftItems[active] : null;
  // Content is duplicated only while the ribbon travels; otherwise one copy, with no doubling.
  const items = scrolling ? [...artifacts, ...artifacts] : artifacts;

  /* No thing has a picture yet ⇒ there is no tile, rather than an empty one. Wave 03 strips the
     plate, so an empty state's words would hang on the bare canvas. DESIGN §7.2 */
  if (shaft && isEmpty) return null;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет артефактов"
      onRetry={retry}
      label="артефакты"
      ariaLabel="Артефакты"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && shaft && (
        <ArtifactShaft artifacts={shaftItems} onOpen={setActive} />
      )}

      {phase === "loaded" && !isEmpty && !shaft && (
        <div
          ref={setBox}
          {...marquee.handlers}
          className={`tile-frame relative flex h-full overflow-hidden ${
            vertical ? "justify-center" : scrolling ? "items-center" : "items-center justify-center"
          }`}
          style={{
            // Along the ribbon the gesture is the ribbon's; across it, it goes to the page — on a
            // phone a finger crossing the tile must scroll the board, not stick in it.
            touchAction: scrolling ? (vertical ? "pan-x" : "pan-y") : undefined,
            userSelect: scrolling ? "none" : undefined,
          }}
        >
          <div
            ref={setTrack}
            className={`artifact-track${vertical ? " artifact-track--vertical" : ""}${scrolling ? " is-scrolling" : ""}`}
          >
            {items.map((a, i) => {
              const idx = i % artifacts.length;
              const dup = i >= artifacts.length;
              return (
                <button
                  key={`${a.name}-${dup ? "dup" : "main"}`}
                  type="button"
                  data-artifact-btn={dup ? undefined : ""}
                  /* The copy exists only for a seamless loop: it is neither announced nor tabbed
                     into. Its CLICK, though, is the original's — both copies pass the viewer, and
                     without this items "clicked every other time" as the ribbon cycled. */
                  aria-hidden={dup || undefined}
                  tabIndex={dup ? -1 : 0}
                  /* Menu on focus is the keyboard equivalent of a click (§9). Focus FROM A POINTER
                     will not do: the browser gives it on press, so the menu opened before the click,
                     and a click on the same item, being a toggle, closed it again immediately. */
                  onFocus={dup ? undefined : () => !marquee.isPointerDown() && setActive(idx)}
                  onClick={() => setActive((cur) => (cur === idx ? null : idx))}
                  /* The picture-to-caption gap stays generous: tight, the caption sticks to the
                     object and reads as part of it rather than as its own line. */
                  className={`${vertical ? "my-3" : "mx-4"} inline-flex flex-col items-center gap-2 align-middle`}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {a.imageUrl ? (
                    <ArtifactThumb
                      src={a.imageUrl}
                      alt={a.name}
                      vertical={vertical}
                      rotatable={a.rotatable === true}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: ARTIFACT_SIZE,
                        height: ARTIFACT_SIZE,
                        background: "var(--bg-surface-muted)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    />
                  )}
                  <span className="t-artifact-pop" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>

        </div>
      )}

      {/* The shaft opens its own card: one object, alone, on the dark (§7.2). The flat ribbon keeps
          its small menu below. */}
      {activeShaftItem && (
        <ArtifactModal
          artifact={activeShaftItem}
          src={activeShaftItem.imageUrl}
          onClose={() => setActive(null)}
        />
      )}

      {/* The artifact menu is a small centred modal (§5.12/§7.6). It is portalled into body
          because the tile's `.pixel-tile` carries `filter` (a containing block for fixed) and
          `overflow-hidden`: without the portal it would pin to the tile and be clipped. */}
      {activeArtifact && !shaft && typeof document !== "undefined" && createPortal(
        <div
          className="modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(33, 26, 22, 0.55)" }}
          onClick={() => setActive(null)}
        >
          <div
            data-artifact-menu=""
            role="dialog"
            aria-modal="true"
            aria-label={activeArtifact.name}
            className="pixel-tile relative flex flex-col items-center p-8"
            style={{ minWidth: 340, maxWidth: "min(94vw, 580px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* The box backing plus the white frame (§2.4) — the menu carries .pixel-tile itself. */}
            <span className="pixel-slab" aria-hidden />
            <span className="pixel-lid" aria-hidden />
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Закрыть"
              className="tap-target absolute right-2 top-2"
              style={{ color: "var(--text-tertiary)", cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
            >
              <Icon name="close" size={18} />
            </button>
            {activeArtifact.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeArtifact.imageUrl}
                alt={activeArtifact.name}
                /* Both sides are ONLY ceilings; the browser sizes by the object's ratio. A fixed
                   width plus `maxHeight` flattened elongated items (a racket is about 1:3.8 — its
                   height hit the ceiling while its width stayed as given). */
                style={{ maxWidth: "min(100%, 400px)", maxHeight: "min(44vh, 420px)", objectFit: "contain", marginTop: 32 }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 160,
                  height: 160,
                  background: "var(--bg-surface-muted)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            )}
            {/* The caption is set off from the picture by a larger gap; its size comes from
                `.modal-scale` (vw) rather than the container-based `t-artifact-*`, which would
                collapse in a portal with no container. */}
            <div className="flex flex-col items-center gap-2" style={{ marginTop: 96 }}>
              {/* Short vertical accent strokes above and below the title (decor §2.4). */}
              <span aria-hidden style={{ width: 2, height: 18, background: "var(--border-tile)" }} />
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: "clamp(20px, calc(12px + 0.7vw), 32px)" }}>
                {activeArtifact.name}
              </span>
              <span aria-hidden style={{ width: 2, height: 18, background: "var(--border-tile)" }} />
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "var(--fs-modal-meta)" }}>
                {formatFirstMentioned(activeArtifact.firstMentionedOn)}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </TileShell>
  );
}
