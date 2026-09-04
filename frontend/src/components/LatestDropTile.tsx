"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getDrop, getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import { GAP, buildMosaic, dropCardWidth, mosaicWidth, type Cell } from "@/lib/mosaic";
import { pluralRu } from "@/lib/rideFormat";
import { pickSeeded } from "@/lib/sample";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

/**
 * Редакции плитки (DESIGN §7.5) — выбирает ВОЛНА через раскладку (`tiles.latestDrop.edition`,
 * §10.1), компонент о волнах не знает. Незнакомое значение ⇒ мозаика.
 * - `mosaic` — justified-мозаика из пяти случайных кадров без обрезки (волна 01);
 * - `frame`  — один случайный кадр во всю карточку, карточка берёт пропорцию кадра (PRIME);
 * - `sheet`  — контактный лист: та же укладка, но четыре кадра и строка данных сверху (Obscura).
 */
export type DropEdition = "mosaic" | "frame" | "sheet";

interface LatestDropTileProps {
  style?: CSSProperties;
  className?: string;
  /** Редакция из раскладки волны (строка как есть; проверяется здесь). */
  edition?: string;
}

interface LatestData {
  latest: FilmDropView | null;
  photos: FilmPhotoView[];
}

/* TileShell horizontal padding (p-4 on both sides) — added back around the mosaic width. */
const CARD_PAD_X = 32;
/* Don't shrink the card below this: the label and caption row need room to breathe. */
const MIN_CARD_W = 200;
/* Frames per edition: the mosaic packs five, the sheet four (two rows of two), the frame one. */
const MOSAIC_FRAMES = 5;
const SHEET_FRAMES = 4;

/* useLayoutEffect warns during SSR of client components — fall back to useEffect there. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-drop-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

function resolveEdition(value: string | undefined): DropEdition {
  return value === "frame" || value === "sheet" ? value : "mosaic";
}

function framesLabel(count: number): string {
  return `${count} ${pluralRu(count, ["кадр", "кадра", "кадров"])}`;
}

/**
 * Ряды justified-мозаики (общие для редакций `mosaic` и `sheet`).
 */
function renderRows(mosaic: Cell[][] | null) {
  return (
    <>
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
    </>
  );
}

/**
 * Тайл последнего фото-дропа (DESIGN §7.5). В дефолтной редакции показывает 5 **случайных**
 * кадров (перетасовка на каждом обновлении страницы) **justified-мозаикой**: кадры разной
 * ориентации (портрет/ландшафт) пакуются в ряды по реальным `width/height` — без обрезки,
 * без искажения, влезая в виджет. Волна вправе выбрать другую редакцию (см. [DropEdition]).
 * Клик → модалка-галерея со всеми кадрами. Прошлые дропы — лентой [PhotoDropsTile]. До первой
 * загрузки через /admin — тихий empty «пока нет дропов».
 */
export function LatestDropTile({ style, className, edition: editionRaw }: LatestDropTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, settled, retry } = useTileData<LatestData>(
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

  // Случайная выборка — новая на каждую загрузку страницы, но ОДНА на загрузку: зерно берётся
  // при монтировании, а выбор из него детерминирован (`lib/sample.ts`). Плитка рендерится
  // дважды — копией из кэша и ответом сети с теми же кадрами, — и без зерна кадр на глазах
  // менялся дважды (замечание владельца на волне 03).
  const [seed] = useState(() => Math.random());
  const sampleSize = edition === "sheet" ? SHEET_FRAMES : edition === "frame" ? 1 : MOSAIC_FRAMES;
  const sample = useMemo(() => pickSeeded(data?.photos ?? [], sampleSize, seed), [data?.photos, sampleSize, seed]);

  // Available width comes from the outer grid-cell wrapper, NOT from the card itself:
  // the card shrinks to the mosaic below, and measuring it back would loop the observer.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [frameH, setFrameH] = useState(0);

  // Height of the mosaic area (label/caption rows are single-line — it doesn't depend on
  // the card width, so it stays a stable input for the layout).
  // Узел — в state (callback-ref), а не в ref: карточка появляется ПОСЛЕ ответа сети, когда
  // фаза уже «loaded» (копия из кэша), и замер, привязанный к фазе, не перезапускался — блок
  // мерился нулём, раскладка не строилась, кадров не было (поймано на второй загрузке).
  const [boxEl, setBoxEl] = useState<HTMLButtonElement | null>(null);
  const [boxH, setBoxH] = useState(0);

  // Synchronous measure before paint: the shrunken width is computed in the same frame the
  // loaded content commits, so cached loads paint the card already hugged (no width flash).
  useIsomorphicLayoutEffect(() => {
    if (frameRef.current) {
      const r = frameRef.current.getBoundingClientRect();
      setFrameW(r.width);
      setFrameH(r.height);
    }
    if (boxEl) setBoxH(boxEl.getBoundingClientRect().height);
  }, [phase, isEmpty, edition, boxEl]);

  // ResizeObserver keeps the measurements live afterwards (window resize, wave/layout swap).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === frameRef.current) {
          setFrameW(entry.contentRect.width);
          setFrameH(entry.contentRect.height);
        }
        if (entry.target === boxEl) setBoxH(entry.contentRect.height);
      }
    });
    if (frameRef.current) ro.observe(frameRef.current);
    if (boxEl) ro.observe(boxEl);
    return () => ro.disconnect();
  }, [phase, isEmpty, edition, boxEl]);

  // Mosaic and sheet share the packer: rows justified by real aspect, no crop, both orientations.
  const mosaic = useMemo(
    () => (edition !== "frame" ? buildMosaic(sample, mosaicWidth(frameW, CARD_PAD_X), boxH) : null),
    [edition, sample, frameW, boxH],
  );

  // Shrink-to-content (per-shuffle): when scale <1 leaves side gaps, the card hugs the
  // widest mosaic row and centers in the cell — label and caption ride along with it.
  const usedW = mosaic
    ? Math.max(...mosaic.map((row) => row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP))
    : 0;
  // Ширина карточки — через `dropCardWidth`, а не руками: она держит инвариант «между
  // мозаикой и краем карточки всегда есть запас». Раньше карточка жалась к ряду впритык
  // (замер: зазор 0.00–0.02px), и в Safari правый кадр обрезался краем.
  const cardW = usedW > 0 && frameW > 0 ? dropCardWidth(usedW, frameW, CARD_PAD_X, MIN_CARD_W) : null;

  // Frame edition: the card itself takes the photo's aspect. In the bento the host gives the
  // wrapper a height (the reserved slot, DESIGN §10.2) and the card fits inside it — landscape
  // fills the width, portrait fills the height; in the stack there is no slot height (the
  // wrapper is as tall as the card, measuring it back would loop), so width rules.
  const frame = edition === "frame" ? (sample[0] ?? null) : null;
  // Карточка-кадр появляется только вместе со снимком. До его прихода стекло не рисуется
  // вовсе: при быстрой перезагрузке пустая карточка без ширины вставала узкой вертикальной
  // полоской и через мгновение заполнялась кадром (замечание владельца) — лучше пауза без
  // виджета, чем виджет без содержимого. Снимок предзагружается отдельным `Image`, и лишь
  // после `load` карточка рендерится сразу с кадром внутри.
  const frameSrc = frame ? mediaUrl(frame.imageUrl) : null;
  const [readySrc, setReadySrc] = useState<string | null>(null);
  useEffect(() => {
    if (!frameSrc) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setReadySrc(frameSrc);
    };
    img.src = frameSrc;
    return () => {
      alive = false;
    };
  }, [frameSrc]);
  const frameReady = frameSrc !== null && readySrc === frameSrc;

  const frameStyle = useMemo<CSSProperties>(() => {
    if (!frame) return { height: "100%" };
    // Кадр без размеров (старый дроп до замера) считаем лежачим 3:2 — пропорцией плёнки.
    const fw = frame.width ?? 3;
    const fh = frame.height ?? 2;
    const a = fw / fh;
    const aspect = `${fw} / ${fh}`;
    if (frameW <= 0) return { aspectRatio: aspect, width: "100%" };
    const slotH = style?.height !== undefined ? frameH : 0;
    let w = frameW;
    let h = frameW / a;
    if (slotH > 0 && h > slotH) {
      h = slotH;
      w = slotH * a;
    }
    return { aspectRatio: aspect, width: w, height: h };
  }, [frame, frameW, frameH, style?.height]);

  const cardStyle: CSSProperties =
    edition === "frame"
      ? frame
        ? frameStyle
        : // Пустота/ошибка в редакции кадра: карточка нужна (в ней «пока нет дропов» и
          // «повторить»), а пропорции кадра нет — берём плёночные 3:2 во всю ширину слота.
          { width: "100%", aspectRatio: "3 / 2" }
      : cardW !== null
        ? // No `transition: width` here — see the note above the component: an animated
          // width on this filtered card smears its drop-shadow across the side gaps in
          // WebKit.
          { height: "100%", width: cardW, marginInline: "auto" }
        : { height: "100%" };

  const openLabel = latest ? `Открыть дроп «${latest.title}»` : undefined;
  const meta = latest
    ? [latest.monthLabel, framesLabel(latest.photoCount)].filter(Boolean).join(" · ")
    : "";

  // Карточки нет, пока СЕТЬ НЕ ОТВЕТИЛА (решение владельца, все редакции и волны): копия из
  // кэша не показывается «на секунду до свежего». Ответила успехом — на экран едут свежие
  // кадры; не ответила (рейтлимит после серии F5) — копия из кэша, но и она появляется один
  // раз, а не сменяется. Редакция кадра ждёт ещё и сам снимок (см. выше).
  const hidden = !settled || (edition === "frame" && frame !== null && !frameReady);

  return (
    <>
      {/* Measuring wrapper keeps the cell's full footprint; the card inside may be narrower. */}
      <div
        ref={frameRef}
        style={style}
        className={`tile-frame t-drop-vars ${edition === "frame" ? "drop-slot--frame" : ""} ${className ?? ""}`}
      >
        {hidden ? null : (
        <TileShell
          state={isEmpty ? "empty" : phase}
          emptyText="пока нет дропов"
          onRetry={retry}
          label="последний дроп"
          ariaLabel="Последний фото-дроп"
          className={edition === "frame" ? "drop-card--frame" : ""}
          style={cardStyle}
        >
          {phase === "loaded" && latest && edition === "frame" && frame && (
            // Один кадр во всю карточку; подпись лежит в нижней полосе, которую кадр отдаёт
            // прогрессивному блюру (`.drop-frame__band`, common.css) — текст на снимке, а не
            // под ним, и без плашки: полоса и есть стекло из самого кадра. Подпись — В полосе,
            // а не рядом с ней: так высота полосы = растушёвка + сама подпись, и длинное
            // название, перенесясь на вторую строку, углубляет её само, без замеров.
            <button type="button" className="drop-frame" onClick={() => setOpen(true)} aria-label={openLabel}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(frame.imageUrl)} alt="" className="drop-frame__img" />
              {/* Полоса несёт адрес кадра переменной: под подписью лежат две РАЗМЫТЫЕ КОПИИ
                  снимка (`.drop-frame__blur`, common.css), а не backdrop-filter — у того на
                  кромках бокса выборка зажимается краем и даёт серую линию. */}
              <span
                className="drop-frame__band"
                style={{ "--drop-frame-src": `url("${mediaUrl(frame.imageUrl)}")` } as CSSProperties}
              >
                <span className="drop-frame__blur drop-frame__blur--soft" aria-hidden />
                <span className="drop-frame__blur drop-frame__blur--deep" aria-hidden />
                <span className="drop-frame__caption">
                  <span className="drop-frame__title">{latest.title}</span>
                  <span className="drop-frame__meta">{meta}</span>
                </span>
              </span>
            </button>
          )}

          {phase === "loaded" && latest && edition === "sheet" && (
            <div className="flex h-full flex-col gap-1">
              {/* Строка данных СВЕРХУ, как шапка контактного листа: имя · месяц слева, счёт кадров справа. */}
              <div className="drop-sheet__head flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ fontSize: "var(--fs-drop-title)", color: "var(--text-primary)" }}>
                  {latest.title}
                  {latest.monthLabel && <span style={monoTertiary}> · {latest.monthLabel}</span>}
                </span>
                <span className="shrink-0" style={monoTertiary}>
                  {framesLabel(latest.photoCount)}
                </span>
              </div>
              {/* Та же укладка, что у мозаики (без обрезки, без поворота, обе ориентации), но
                  четыре кадра: два ряда по два в квадратной плитке. `drop-mosaic` — ради своей
                  высоты в стеке (§8), `drop-sheet` — зацепка редакции. */}
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                className="drop-mosaic drop-sheet flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
              </button>
            </div>
          )}

          {phase === "loaded" && latest && edition === "mosaic" && (
            <div className="flex h-full flex-col gap-1">
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                // drop-mosaic: своя высота там, где родитель её не задаёт (мобильный стек, §8) —
                // без неё boxH=0, раскладка не строится и кадры не появляются вовсе.
                className="drop-mosaic flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
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
        )}
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
