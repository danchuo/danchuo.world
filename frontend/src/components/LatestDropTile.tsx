"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
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
 */
function buildMosaic(photos: FilmPhotoView[], W: number, H: number): Cell[][] | null {
  if (W <= 0 || H <= 0 || photos.length === 0) return null;
  let best: { rows: Cell[][]; score: number } | null = null;

  for (let r = 1; r <= photos.length; r++) {
    const groups = balancedRows(photos, r);
    if (groups.length !== r) continue;

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

  // Измеряем область мозаики — justified-раскладка зависит от реальных размеров виджета.
  const boxRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, isEmpty]);

  const mosaic = useMemo(() => buildMosaic(sample, box.w, box.h), [sample, box.w, box.h]);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="пока нет дропов"
        onRetry={retry}
        label="последний дроп"
        ariaLabel="Последний фото-дроп"
        style={style}
        className={className}
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
              <span className="truncate" style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {latest.title}
              </span>
              {latest.monthLabel && <span style={monoTertiary}>{latest.monthLabel}</span>}
            </div>
          </div>
        )}
      </TileShell>

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
