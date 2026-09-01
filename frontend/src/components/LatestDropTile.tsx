"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getDrop, getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import { GAP, buildMosaic, dropCardWidth, mosaicWidth } from "@/lib/mosaic";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface LatestDropTileProps {
  style?: CSSProperties;
  className?: string;
}

interface LatestData {
  latest: FilmDropView | null;
  photos: FilmPhotoView[];
}

/* TileShell horizontal padding (p-4 on both sides) — added back around the mosaic width. */
const CARD_PAD_X = 32;
/* Don't shrink the card below this: the label and caption row need room to breathe. */
const MIN_CARD_W = 200;

/* useLayoutEffect warns during SSR of client components — fall back to useEffect there. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-drop-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

/** Случайные [count] кадров (перемешивание копии Фишера–Йетса). */
function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/**
 * Тайл последнего фото-дропа (DESIGN §7.5). Показывает 5 **случайных** кадров (перетасовка на
 * каждом обновлении страницы) **justified-мозаикой**: кадры разной ориентации (портрет/ландшафт)
 * пакуются в ряды по реальным `width/height` — без обрезки, без искажения, влезая в виджет.
 * Клик → модалка-галерея со всеми кадрами. Прошлые дропы — лентой [PhotoDropsTile]. До первой
 * загрузки через /admin — тихий empty «пока нет дропов».
 */
export function LatestDropTile({ style, className }: LatestDropTileProps) {
  const { phase, data, retry } = useTileData<LatestData>(
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

  // 5 случайных кадров — пересобираются при новой загрузке (новая ссылка data.photos).
  const sample = useMemo(() => pickRandom(data?.photos ?? [], 5), [data?.photos]);

  // Available width comes from the outer grid-cell wrapper, NOT from the card itself:
  // the card shrinks to the mosaic below, and measuring it back would loop the observer.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);

  // Height of the mosaic area (label/caption rows are single-line — it doesn't depend on
  // the card width, so it stays a stable input for the layout).
  const boxRef = useRef<HTMLButtonElement>(null);
  const [boxH, setBoxH] = useState(0);

  // Synchronous measure before paint: the shrunken width is computed in the same frame the
  // loaded content commits, so cached loads paint the card already hugged (no width flash).
  useIsomorphicLayoutEffect(() => {
    if (frameRef.current) setFrameW(frameRef.current.getBoundingClientRect().width);
    if (boxRef.current) setBoxH(boxRef.current.getBoundingClientRect().height);
  }, [phase, isEmpty]);

  // ResizeObserver keeps the measurements live afterwards (window resize, wave/layout swap).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === frameRef.current) setFrameW(entry.contentRect.width);
        if (entry.target === boxRef.current) setBoxH(entry.contentRect.height);
      }
    });
    if (frameRef.current) ro.observe(frameRef.current);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [phase, isEmpty]);

  const mosaic = useMemo(
    () => buildMosaic(sample, mosaicWidth(frameW, CARD_PAD_X), boxH),
    [sample, frameW, boxH],
  );

  // Shrink-to-content (per-shuffle): when scale <1 leaves side gaps, the card hugs the
  // widest mosaic row and centers in the cell — label and caption ride along with it.
  const usedW = mosaic
    ? Math.max(...mosaic.map((row) => row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP))
    : 0;
  // Ширина карточки — через `dropCardWidth`, а не руками: она держит инвариант «между
  // мозаикой и краем карточки всегда есть запас». Раньше карточка жалась к ряду впритык
  // (замер: зазор 0.00–0.02px), и в Safari правый кадр обрезался краем.
  const cardW = mosaic && frameW > 0 ? dropCardWidth(usedW, frameW, CARD_PAD_X, MIN_CARD_W) : null;

  return (
    <>
      {/* Measuring wrapper keeps the cell's full footprint; the card inside may be narrower. */}
      <div ref={frameRef} style={style} className={`tile-frame t-drop-vars ${className ?? ""}`}>
        <TileShell
          state={isEmpty ? "empty" : phase}
          emptyText="пока нет дропов"
          onRetry={retry}
          label="последний дроп"
          ariaLabel="Последний фото-дроп"
          style={
            cardW !== null
              ? // No `transition: width` here — see the note above the component: an animated
                // width on this filtered card smears its drop-shadow across the side gaps in
                // WebKit.
                { height: "100%", width: cardW, marginInline: "auto" }
              : { height: "100%" }
          }
        >
          {phase === "loaded" && latest && (
            <div className="flex h-full flex-col gap-1">
              <button
                ref={boxRef}
                type="button"
                onClick={() => setOpen(true)}
                // drop-mosaic: своя высота там, где родитель её не задаёт (мобильный стек, §8) —
                // без неё boxH=0, раскладка не строится и кадры не появляются вовсе.
                className="drop-mosaic flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={`Открыть дроп «${latest.title}»`}
              >
                {/* ⚠️ Ширину ряда раздаёт САМ ФЛЕКСБОКС, а не пиксели из JS, — и это несущее
                    решение, а не оптимизация. Прежде расчёт мерил ячейку, делил ширину на
                    кадры и записывал результат в `style.width` каждой картинки, то есть
                    держался на том, что движок сложит эти числа ровно так же. Safari
                    складывал иначе, и правый кадр вылезал за карточку. Теперь ряд заполняет
                    контейнер ПО ОПРЕДЕЛЕНИЮ: `flex-basis: 0` + `flex-grow` пропорционально
                    ширине ячейки дают ровно justified-формулу `(W − зазоры)·aᵢ/Σa`, только
                    считает её раскладчик — по своей же реальной ширине. Переполнение
                    становится невозможным структурно, а не арифметически.
                    Высоту держит `aspect-ratio`: ширины пропорциональны аспектам, значит
                    высоты у кадров ряда совпадают сами, без общего числа из JS. */}
                {mosaic?.map((row, ri) => {
                  // Расчётная ширина ряда остаётся ПОТОЛКОМ: в ветке, где карточка упёрлась
                  // в край ячейки, контейнер чуть шире расчёта, и без потолка ряд подрос бы
                  // в высоту на пиксель-другой.
                  const rowW = row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP;
                  return (
                    <div
                      key={ri}
                      className="flex"
                      // `flex-start` по поперечной оси: иначе `stretch` тянул бы картинку по
                      // высоте ряда и спорил с `aspect-ratio`.
                      style={{ gap: GAP, width: "100%", maxWidth: rowW, alignItems: "flex-start" }}
                    >
                      {row.map((cell, ci) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${cell.photo.thumbUrl}-${ri}-${ci}`}
                          src={mediaUrl(cell.photo.thumbUrl)}
                          alt=""
                          style={{
                            // grow по ширине ячейки = grow по аспекту (высота в ряду общая).
                            flex: `${cell.w} 1 0`,
                            minWidth: 0,
                            aspectRatio: `${cell.w} / ${cell.h}`,
                            height: "auto",
                            objectFit: "cover", // бокс точно по пропорции кадра ⇒ без обрезки
                            borderRadius: "var(--radius-sm)",
                            display: "block",
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
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
      </div>

      {open && latest && (
        <PhotoDropModal
          dropId={latest.id}
          title={latest.title}
          monthLabel={latest.monthLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
