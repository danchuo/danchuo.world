/**
 * Layout-конфиг bento-сетки (DESIGN §3, карта 20×14) — **реестр тайлов** эры M2
 * (PRD §3.1, §12 M2). Каждый тайл объявляет `{col, row, colSpan, rowSpan}`; волна
 * может переопределять спаны без правок компонентов. Новый виджет = запись здесь +
 * компонент в `Board`.
 *
 * Координаты 1-индексные (как `grid-column-start`). Холст — 20 столбцов × 14 строк.
 */

export type TileId =
  | "identity"
  | "photoDrops"
  | "waveSwitcher"
  | "freshness"
  | "music"
  | "stats"
  | "today"
  | "calendar"
  | "projects"
  | "hero"
  | "social"
  | "marquee";

export interface TileSpan {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export const BENTO_COLS = 20;
export const BENTO_ROWS = 14;

/** Спаны волны 01 (DESIGN §3). */
export const TILE_LAYOUT: Record<TileId, TileSpan> = {
  identity: { col: 1, row: 1, colSpan: 5, rowSpan: 2 },
  photoDrops: { col: 6, row: 1, colSpan: 9, rowSpan: 2 },
  waveSwitcher: { col: 16, row: 1, colSpan: 2, rowSpan: 2 },
  freshness: { col: 19, row: 1, colSpan: 2, rowSpan: 2 },
  music: { col: 1, row: 3, colSpan: 5, rowSpan: 3 },
  stats: { col: 1, row: 6, colSpan: 5, rowSpan: 6 },
  today: { col: 6, row: 3, colSpan: 9, rowSpan: 9 },
  calendar: { col: 16, row: 3, colSpan: 5, rowSpan: 6 },
  projects: { col: 16, row: 9, colSpan: 5, rowSpan: 3 },
  hero: { col: 1, row: 12, colSpan: 6, rowSpan: 3 },
  social: { col: 7, row: 12, colSpan: 4, rowSpan: 3 },
  marquee: { col: 11, row: 12, colSpan: 10, rowSpan: 3 },
};

/** Порядок одноколоночного стека на мобиле (<640px, DESIGN §8). */
export const MOBILE_ORDER: TileId[] = [
  "today",
  "calendar",
  "stats",
  "music",
  "photoDrops",
  "projects",
  "social",
  "hero",
  "marquee",
];

/** CSS grid-area для тайла (`row / col / row-end / col-end`). */
export function gridArea(span: TileSpan): string {
  return `${span.row} / ${span.col} / ${span.row + span.rowSpan} / ${span.col + span.colSpan}`;
}
