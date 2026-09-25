"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { getTierlists, postTierlist, PostRefusedError } from "@/lib/api/client";
import type { TierlistView } from "@/lib/api/types";
import {
  dropIndex,
  EMPTY_BOARD,
  fromPublished,
  isComplete,
  NICK_MAX,
  nickKey,
  place,
  SHIRTS,
  shirtLabel,
  TIER_LABEL,
  TIERS,
  tierlistErrorText,
  unplaced,
  type Board,
  type Shirt,
  type Slot,
  type TierKey,
} from "@/lib/tierlist";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";

interface TierlistModalProps {
  onClose: () => void;
}

type Phase = "edit" | "sending";

/** A shirt in flight and its side; the position lives in a ref, written straight to the ghost. */
interface Drag {
  id: string;
  size: number;
}

/** Pointer travel before a press becomes a drag; less is a tap that selects. */
const DRAG_THRESHOLD = 5;

const SHIRT_BY_ID = new Map(SHIRTS.map((s) => [s.id, s]));

/** The tier, pool or magnifier (and index) under a screen point; the ghost is `pointer-events: none`. */
function targetAt(board: Board, id: string, x: number, y: number): { slot: Slot | "zoom"; index?: number } | null {
  const el = document.elementFromPoint(x, y);
  const slotEl = el?.closest<HTMLElement>("[data-slot]");
  if (!slotEl) return null;
  const slot = slotEl.dataset.slot as Slot | "zoom";
  if (slot === "pool" || slot === "zoom") return { slot };
  const over = el?.closest<HTMLElement>("[data-item]");
  const rect = over?.getBoundingClientRect();
  const after = rect ? x > rect.left + rect.width / 2 : false;
  return { slot, index: dropIndex(board, id, slot, over?.dataset.item ?? null, after) };
}

/**
 * The shirt tier list in tiermaker's own dress: a ladder S–D, the unplaced shirts under it, and on
 * the right everyone who has published. A shirt moves by drag, or by tap-then-tap on a tier for
 * touch and keyboard. Publishing opens only when the pool is empty. PRD §5.20, DESIGN §7.12
 */
export function TierlistModal({ onClose }: TierlistModalProps) {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [nick, setNick] = useState("");
  const [website, setWebsite] = useState("");
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<TierlistView[] | null>(null);
  const [listsFailed, setListsFailed] = useState(false);
  const [viewing, setViewing] = useState<TierlistView | null>(null);
  const [justPublished, setJustPublished] = useState<number | null>(null);
  // Nicks the server refused as taken though the loaded shelf did not show them (bot-marked, or newer).
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set());
  // The shirt shown large; a visitor's own one waits there off the board and closing drops it in the pool.
  const [zoomed, setZoomed] = useState<string | null>(null);
  // A drag ends in a `click` on the shirt it started from; that click must not toggle selection.
  const suppressClick = useRef(false);
  // The ghost follows the pointer outside React: a render per pointermove made it trail the cursor.
  const ghost = useRef<HTMLDivElement>(null);
  const ghostAt = useRef("");

  // No scrollbar on the list: while more lies below, its bottom row fades out instead. DESIGN §7.12
  const peopleRef = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const checkMore = useCallback(() => {
    const el = peopleRef.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomed) setZoomed(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomed]);

  const loadLists = useCallback(async () => {
    setListsFailed(false);
    try {
      setLists(await getTierlists());
    } catch {
      setListsFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    const el = peopleRef.current;
    if (!el) return;
    checkMore();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(checkMore);
    watch.observe(el);
    return () => watch.disconnect();
  }, [lists, checkMore]);

  const editable = viewing === null && phase === "edit";
  const shown = viewing ? fromPublished(viewing.tiers, SHIRTS) : board;
  const pool = unplaced(board, SHIRTS).filter((s) => s.id !== zoomed);
  const complete = isComplete(board, SHIRTS);
  const key = nickKey(nick);
  const nickTaken =
    phase === "edit" && key !== "" && (refused.has(key) || (lists ?? []).some((l) => l.nick !== null && nickKey(l.nick) === key));

  function moveTo(slot: Slot, index?: number) {
    if (!selected || !editable) return;
    setBoard((b) => place(b, selected, slot, index));
    setSelected(null);
  }

  function zoomIn(id: string) {
    setBoard((b) => place(b, id, "pool"));
    setSelected(null);
    setZoomed(id);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (!editable || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    let dragging = false;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      ghostAt.current = `translate3d(${ev.clientX - dx}px, ${ev.clientY - dy}px, 0)`;
      if (ghost.current) ghost.current.style.transform = ghostAt.current;
      if (dragging) return;
      dragging = true;
      setDrag({ id, size: rect.width });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) return;
      suppressClick.current = true;
      setDrag(null);
      setSelected(null);
      if (ev.type === "pointercancel") return;
      // The board cannot change mid-drag, so the one from the press is current.
      const target = targetAt(board, id, ev.clientX, ev.clientY);
      if (target?.slot === "zoom") zoomIn(id);
      else if (target) setBoard((b) => place(b, id, target.slot as Slot, target.index));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** A tap selects; a tap on another shirt while one is selected puts the selected one before it. */
  function onShirtClick(e: ReactMouseEvent, id: string) {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (viewing) {
      setZoomed(id);
      return;
    }
    if (!editable) return;
    if (selected === null || selected === id) {
      setSelected(selected === id ? null : id);
      return;
    }
    const tier = TIERS.find((t) => board[t].includes(id));
    moveTo(tier ?? "pool", tier ? dropIndex(board, selected, tier, id, false) : undefined);
  }

  async function publish() {
    if (!complete || nickTaken || phase !== "edit") return;
    setPhase("sending");
    setError(null);
    const sent = { nick: nick.trim() || null, tiers: board };
    try {
      const { id } = await postTierlist({ nick: sent.nick ?? undefined, tiers: sent.tiers, website });
      // A fresh board for the next list, and the one just sent opened on the right.
      setBoard(EMPTY_BOARD);
      setNick("");
      setSelected(null);
      setJustPublished(id);
      setViewing({ id, submittedAt: new Date().toISOString(), ...sent });
      void loadLists();
    } catch (e) {
      if (e instanceof PostRefusedError && e.code === "nick_taken") {
        setRefused((r) => new Set(r).add(key));
        return;
      }
      setError(tierlistErrorText(e instanceof PostRefusedError ? e.code : "network", e instanceof PostRefusedError ? e.field : undefined));
    } finally {
      setPhase("edit");
    }
  }

  function renderShirt(shirt: Shirt) {
    return (
      <button
        key={shirt.id}
        type="button"
        data-item={shirt.id}
        className="tier-shirt"
        data-selected={selected === shirt.id || undefined}
        data-lifted={drag?.id === shirt.id || undefined}
        aria-pressed={editable ? selected === shirt.id : undefined}
        aria-label={shirtLabel(shirt.id)}
        disabled={!editable && viewing === null}
        onPointerDown={(e) => onPointerDown(e, shirt.id)}
        onClick={(e) => onShirtClick(e, shirt.id)}
      >
        <img src={shirt.image} alt="" draggable={false} />
      </button>
    );
  }

  if (typeof document === "undefined") return null;

  const dragged = drag ? SHIRT_BY_ID.get(drag.id) : undefined;
  const zoomShirt = zoomed ? SHIRT_BY_ID.get(zoomed) : undefined;

  return createPortal(
    <div
      className="feedback-scene tier-scene modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="тирлист футболок"
        className="tier-modal relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Закрыть" className="feedback-modal__close tap-target">
          <Icon name="close" size={18} />
        </button>

        <div className="tier-modal__main">
          {viewing && (
            <header className="tier-modal__head">
              <h2 className="tier-modal__title">тирлист от {viewing.nick ?? "аноним"}</h2>
              {viewing.id === justPublished && <p className="tier-modal__lead">опубликовано</p>}
            </header>
          )}

          <div className="tier-table">
            {TIERS.map((tier: TierKey) => (
              <div key={tier} className="tier-row" data-slot={tier} onClick={() => moveTo(tier)}>
                <button
                  type="button"
                  className="tier-row__label"
                  data-tier={tier}
                  aria-label={selected ? `положить в тир ${TIER_LABEL[tier]}` : `тир ${TIER_LABEL[tier]}`}
                  tabIndex={selected ? 0 : -1}
                >
                  {TIER_LABEL[tier]}
                </button>
                <div className="tier-row__items">
                  {shown[tier].map((id) => {
                    const shirt = SHIRT_BY_ID.get(id);
                    return shirt ? renderShirt(shirt) : null;
                  })}
                </div>
              </div>
            ))}
          </div>

          {viewing && (
            <div className="tier-modal__foot" data-end>
              <button type="button" className="tier-modal__publish" onClick={() => setViewing(null)}>
                ← к моему
              </button>
            </div>
          )}

          {viewing === null && (
            <>
              <div className="tier-pool-row">
                <div
                  className="tier-pool"
                  data-slot="pool"
                  data-empty={pool.length === 0 || undefined}
                  onClick={() => moveTo("pool")}
                >
                  {pool.length > 0 ? pool.map(renderShirt) : <span className="tier-pool__done">все расставлены</span>}
                </div>
                <button
                  type="button"
                  className="tier-zoom-well"
                  data-slot="zoom"
                  data-armed={selected !== null || drag !== null || undefined}
                  aria-label="рассмотреть крупно"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selected) zoomIn(selected);
                  }}
                >
                  <Icon name="zoom" size={20} />
                  <span>рассмотреть</span>
                </button>
              </div>

              <div className="tier-modal__foot">
                <label className="tier-modal__nick">
                  <span>от кого</span>
                  <input
                    type="text"
                    maxLength={NICK_MAX}
                    value={nick}
                    placeholder="аноним"
                    disabled={phase !== "edit"}
                    onChange={(e) => setNick(e.target.value)}
                  />
                </label>

                {/* The honeypot, off-screen as in the note form. */}
                <div className="feedback-modal__trap" aria-hidden>
                  <label>
                    сайт
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="tier-modal__publish"
                  disabled={!complete || nickTaken || phase !== "edit"}
                  onClick={publish}
                >
                  {phase === "sending" ? "публикую…" : "опубликовать"}
                </button>
                {nickTaken && (
                  <span className="tier-modal__left" data-warn role="status">
                    ник «{nick.trim()}» уже занят — возьми другой
                  </span>
                )}
              </div>
              {error && (
                <p className="feedback-modal__error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <aside className="tier-modal__side" aria-label="чужие листы">
          <h3 className="tier-modal__side-title">чужие листы</h3>
          {lists === null && !listsFailed && <p className="tier-modal__quiet">загрузка…</p>}
          {listsFailed && (
            <button type="button" className="tier-modal__back" onClick={() => void loadLists()}>
              не загрузилось — ещё раз
            </button>
          )}
          {lists?.length === 0 && <p className="tier-modal__quiet">пока никто — будь первым</p>}
          {lists && lists.length > 0 && (
            <ul
              ref={peopleRef}
              className="tier-modal__people scroll-invisible"
              data-more={more || undefined}
              onScroll={checkMore}
            >
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    className="tier-modal__person"
                    aria-current={viewing?.id === list.id || undefined}
                    onClick={() => {
                      setSelected(null);
                      setViewing(list);
                    }}
                  >
                    <span className="tier-modal__person-nick">{list.nick ?? "аноним"}</span>
                    <TierMini tiers={list.tiers} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {zoomShirt && (
        <div
          className="tier-zoom"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(null);
          }}
        >
          <figure className="tier-zoom__card" onClick={(e) => e.stopPropagation()}>
            <img src={zoomShirt.large} alt={`${shirtLabel(zoomShirt.id)} крупно`} />
            <button type="button" className="tier-zoom__close" onClick={() => setZoomed(null)}>
              {viewing ? "закрыть" : "вернуться"}
            </button>
          </figure>
        </div>
      )}

      {drag && dragged && (
        <div
          ref={ghost}
          className="tier-ghost"
          style={{ transform: ghostAt.current, width: drag.size, height: drag.size }}
        >
          <img src={dragged.image} alt="" />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Someone's ladder at a glance: coloured tier stubs with their shirts in thumbnail. */
function TierMini({ tiers }: { tiers: Record<string, string[]> }) {
  const board = fromPublished(tiers, SHIRTS);
  return (
    <span className="tier-mini" aria-hidden>
      {TIERS.map((tier) => (
        <span key={tier} className="tier-mini__row">
          <span className="tier-mini__label" data-tier={tier} />
          <span className="tier-mini__items">
            {board[tier].map((id) => (
              <img key={id} src={SHIRT_BY_ID.get(id)?.image} alt="" loading="lazy" draggable={false} />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
