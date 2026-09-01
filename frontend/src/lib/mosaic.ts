/**
 * Justified-раскладка кадров фото-дропа (DESIGN §7.5) — чистый расчёт, отдельно от
 * компонента: `LatestDropTile.tsx` должен экспортировать только компоненты, иначе
 * Fast Refresh не сохраняет состояние при правке файла.
 */

import type { FilmPhotoView } from "@/lib/api/types";

export interface Cell {
  photo: FilmPhotoView;
  w: number;
  h: number;
}

/** Зазор между кадрами мозаики (px) — тот же и в расчёте, и в разметке ряда. */
export const GAP = 6;

/**
 * Запас между мозаикой и внутренним краем карточки (px).
 *
 * ⚠️ Не косметика, а ИНВАРИАНТ. Раскладка justified заполняет отпущенную ширину ровно, а
 * карточка жалась к результату — замер на живом стенде давал зазор 0.00–0.02px. При нулевом
 * запасе исход решает арифметика движка: ширины ячеек дробные, каждый вложенный бокс
 * округляется по-своему, и у Safari сумма выходила чуть больше внутренней ширины — правый
 * кадр обрезался краем карточки. Запас снимает вопрос целиком, вместо того чтобы подгонять
 * округления под конкретный браузер.
 */
export const MOSAIC_SLACK = 2;

/** Ширина, под которую строится мозаика: из ячейки вычтены поля карточки И запас. */
export function mosaicWidth(frameW: number, padX: number): number {
  return Math.max(0, frameW - padX - MOSAIC_SLACK);
}

/**
 * Ширина карточки под готовую мозаику: жмётся к её самому широкому ряду, но не уже минимума
 * и не шире своей ячейки. Ряд округляется ВВЕРХ — дробный остаток обязан достаться карточке,
 * а не съесть запас.
 */
export function dropCardWidth(usedW: number, frameW: number, padX: number, minW: number): number {
  const hug = Math.ceil(usedW) + padX + MOSAIC_SLACK;
  return Math.min(frameW, Math.max(hug, minW));
}
/* A full 5-photo strip in a single row reads ugly (owner's call) — cap rows at 4 photos.
   A compliant split always exists (one photo per row at worst), so no re-sampling needed. */
const MAX_PER_ROW = 4;

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
    // ⚠️ Размеры ячеек — ЦЕЛЫЕ пиксели, и это не косметика расчёта. Дробную ширину каждый
    // бокс движок округляет сам и по-своему: ряд из четырёх кадров набирал до ~4px сверх
    // расчёта, съедал запас MOSAIC_SLACK и обрезался краем карточки в Safari (ряды из двух-
    // трёх при этом влезали — оттого симптом и выглядел случайным). Целые числа округлять
    // нечего: что посчитали, то и нарисовано, каким бы движок ни был.
    // Округляем ВНИЗ: ряд может выйти у́же расчёта, но никогда шире.
    const rows: Cell[][] = groups.map((g, i) => {
      const h = Math.floor(rowH[i] * scale);
      return g.map((photo) => ({ photo, w: Math.floor(aspectOf(photo) * h), h }));
    });
    best = { rows, score };
  }
  return best?.rows ?? null;
}
