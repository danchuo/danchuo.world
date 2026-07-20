"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getDrop, getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
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

interface Cell {
  photo: FilmPhotoView;
  w: number;
  h: number;
}

const GAP = 6;
/* A full 5-photo strip in a single row reads ugly (owner's call) — cap rows at 4 photos.
   A compliant split always exists (one photo per row at worst), so no re-sampling needed. */
const MAX_PER_ROW = 4;
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

const aspectOf = (p: FilmPhotoView) => (p.width && p.height && p.height > 0 ? p.width / p.height : 1);

/** Разбить кадры на [rows] смежных рядов, балансируя сумму пропорций (≈ровные высоты рядов). */
function balancedRows(photos: FilmPhotoView[], rows: number): FilmPhotoView[][] {
  const target = photos.reduce((s, p) => s + aspectOf(p), 0) / rows;
  const groups: FilmPhotoView[][] = [];
  let cur: FilmPhotoView[] = [];
  let curSum = 0;
  for (let i = 0; i < photos.length; i++) {
    cur.push(photos[i]);
    curSum += aspectOf(photos[i]);
    const itemsLeft = photos.length - 1 - i;
    const rowsLeft = rows - groups.length - 1; // ряды после текущего
    // Закрываем ряд, когда добрали целевую сумму и хватает кадров на оставшиеся ряды.
    if (curSum >= target && rowsLeft > 0 && itemsLeft >= rowsLeft) {
      groups.push(cur);
      cur = [];
      curSum = 0;
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Justified-мозаика: пакует кадры в ряды, заполняющие ширину, и подбирает число рядов так,
 * чтобы естественная высота раскладки была ближе всего к высоте виджета. Каждая ячейка имеет
 * точную пропорцию своего кадра ⇒ **без обрезки и без искажения**; масштаб ≤1 не даёт вылезти
 * за пределы (центрируется остаток). `null` — пока контейнер не измерен.
 * Ряды длиннее [MAX_PER_ROW] кадров отбрасываются ещё кандидатами (лента из 5 в один ряд
 * не собирается никогда); вариант «по кадру на ряд» валиден всегда, так что раскладка есть.
 */
export function buildMosaic(photos: FilmPhotoView[], W: number, H: number): Cell[][] | null {
  if (W <= 0 || H <= 0 || photos.length === 0) return null;
  let best: { rows: Cell[][]; score: number } | null = null;

  for (let r = 1; r <= photos.length; r++) {
    const groups = balancedRows(photos, r);
    if (groups.length !== r) continue;
    if (groups.some((g) => g.length > MAX_PER_ROW)) continue;

    const rowH = groups.map((g) => {
      const sa = g.reduce((s, p) => s + aspectOf(p), 0);
      return (W - (g.length - 1) * GAP) / sa; // высота, при которой ряд заполняет ширину
    });
    const totalH = rowH.reduce((s, h) => s + h, 0) + (r - 1) * GAP;
    // Чем ближе естественная высота к высоте виджета, тем меньше пустот по обеим осям.
    const score = Math.min(totalH, H) / Math.max(totalH, H);
    if (best && score <= best.score) continue;

    const scale = Math.min(1, H / totalH); // не даём вылезти за высоту
    const rows: Cell[][] = groups.map((g, i) => {
      const h = rowH[i] * scale;
      return g.map((photo) => ({ photo, w: aspectOf(photo) * h, h }));
    });
    best = { rows, score };
  }
  return best?.rows ?? null;
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
    () => buildMosaic(sample, Math.max(0, frameW - CARD_PAD_X), boxH),
    [sample, frameW, boxH],
  );

  // Shrink-to-content (per-shuffle): when scale <1 leaves side gaps, the card hugs the
  // widest mosaic row and centers in the cell — label and caption ride along with it.
  const usedW = mosaic
    ? Math.max(...mosaic.map((row) => row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP))
    : 0;
  const cardW = mosaic && frameW > 0 ? Math.min(frameW, Math.max(usedW + CARD_PAD_X, MIN_CARD_W)) : null;

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
              ? // Width transition softens the one unavoidable jump (first-ever load, no cache);
                // the global reduced-motion rule in common.css neutralizes it when asked.
                { height: "100%", width: cardW, marginInline: "auto", transition: "width 180ms ease" }
              : { height: "100%" }
          }
        >
          {phase === "loaded" && latest && (
            <div className="flex h-full flex-col gap-1">
              <button
                ref={boxRef}
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={`Открыть дроп «${latest.title}»`}
              >
                {mosaic?.map((row, ri) => (
                  <div key={ri} className="flex" style={{ gap: GAP }}>
                    {row.map((cell, ci) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${cell.photo.thumbUrl}-${ri}-${ci}`}
                        src={mediaUrl(cell.photo.thumbUrl)}
                        alt=""
                        style={{
                          width: cell.w,
                          height: cell.h,
                          objectFit: "cover", // бокс точно по пропорции кадра ⇒ без обрезки
                          borderRadius: "var(--radius-sm)",
                          display: "block",
                        }}
                      />
                    ))}
                  </div>
                ))}
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
