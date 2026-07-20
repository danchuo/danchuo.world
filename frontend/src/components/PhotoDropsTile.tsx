"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import type { FilmDropView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface PhotoDropsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Content flow (DESIGN §10.1): "horizontal" — a strip of cover cards with titles below
   * (readable, no truncation to nothing); "vertical" (default) — the compact list of rows.
   */
  orientation?: TileOrientation;
}

/**
 * Компактная лента фото-дропов (D) — PRD §5.12, DESIGN §7.5. Маленькое перечисление всех дропов
 * (обложка + название), новые слева; клик по дропу → модалка-галерея. Сама лента и есть архив —
 * отдельной страницы нет. Крупно последний дроп показывает отдельный [LatestDropTile]. До первой
 * загрузки через /admin дропов нет ⇒ тихий empty «пока нет дропов».
 */
export function PhotoDropsTile({ style, className, orientation = "vertical" }: PhotoDropsTileProps) {
  const { phase, data, retry } = useTileData<FilmDropView[]>(
    useCallback((signal) => getDrops({ signal }), []),
    "drops",
  );
  const drops = data ?? [];
  const isEmpty = phase === "loaded" && drops.length === 0;
  const [openDrop, setOpenDrop] = useState<FilmDropView | null>(null);
  const horizontal = orientation === "horizontal";
  const shelfRef = useRef<HTMLUListElement>(null);

  // Живой скролл горизонтальной полки без видимого ползунка (DESIGN §7.5): вертикальное колесо
  // мыши листает полку вбок. Перетаскивания мышью НЕТ намеренно — оно перехватывало клик и
  // мешало открывать дроп на весь экран; листаем только колесом (и родным touch/трекпадом).
  // На краях колесо отдаётся странице (не запираем прокрутку).
  useEffect(() => {
    const el = shelfRef.current;
    if (!el || !horizontal) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // родной горизонтальный (трекпад)
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= max - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return; // край → страница скроллит
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [horizontal, phase, drops.length]);

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
        {phase === "loaded" && !isEmpty && (horizontal ? (
          // Horizontal strip: big cover cards with the title underneath. Extra drops scroll
          // sideways; no visible scrollbar — the cut-off card at the edge is the affordance.
          <ul
            ref={shelfRef}
            className="tile-frame flex h-full items-stretch gap-3 overflow-x-auto overflow-y-hidden"
            style={{ scrollbarWidth: "none" }}
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
                      src={mediaUrl(d.coverPhotoUrl)}
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
          <ul className="tile-frame flex h-full flex-col gap-1.5 overflow-y-auto">
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
                      src={mediaUrl(d.coverPhotoUrl)}
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
          onClose={() => setOpenDrop(null)}
        />
      )}
    </>
  );
}
