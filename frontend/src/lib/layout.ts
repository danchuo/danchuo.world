/**
 * Layout-конфиг bento-сетки (DESIGN §3) — **реестр тайлов** эры M2 (PRD §3.1, §12 M2).
 * Каждый тайл объявляет `{col, row, colSpan, rowSpan}`; волна может переопределять спаны
 * без правок компонентов. Новый виджет = запись здесь + компонент в `Board`.
 *
 * Координаты 1-индексные (как `grid-column-start`). Холст — **40 столбцов × 28 строк**:
 * исходная карта 20×14 раздроблена ×2, чтобы между каждой парой соседних тайлов лёг
 * пустой трек-прослойка (воздух). Преобразование каждой исходной величины — `v → 2v−1`:
 * координаты удваиваются (становятся нечётными), а спаны отдают по одному трейлинг-треку
 * (правый/нижний) под gutter. Где в исходнике уже был намеренный воздух (кол. 15, 18) —
 * прослойка пропорционально шире (3 трека). Пустые треки элементами не заняты — это фон.
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

export const BENTO_COLS = 40;
export const BENTO_ROWS = 28;

/**
 * Спаны волны 01 (DESIGN §3) на сетке 40×28. Значения = исходная карта 20×14, прогнанная
 * через `v → 2v−1` (см. шапку файла): между каждой парой соседей — пустой трек-прослойка.
 */
export const TILE_LAYOUT: Record<TileId, TileSpan> = {
  identity: { col: 1, row: 1, colSpan: 9, rowSpan: 3 },
  // Центральная колонка (тизер дропов + главная «Сегодня») сдвинута на 1 клетку вправо
  // → прослойки по бокам центра симметричны (по 2 трека).
  photoDrops: { col: 12, row: 1, colSpan: 17, rowSpan: 3 },
  waveSwitcher: { col: 31, row: 1, colSpan: 3, rowSpan: 3 },
  freshness: { col: 37, row: 1, colSpan: 3, rowSpan: 3 },
  music: { col: 1, row: 5, colSpan: 9, rowSpan: 6 },
  // Статы ужаты ~вдвое по высоте и прижаты к низу левой колонки (воздух сверху, ряды 11–15).
  stats: { col: 1, row: 16, colSpan: 9, rowSpan: 6 },
  today: { col: 12, row: 5, colSpan: 17, rowSpan: 17 },
  calendar: { col: 31, row: 5, colSpan: 9, rowSpan: 11 },
  projects: { col: 31, row: 17, colSpan: 9, rowSpan: 5 },
  hero: { col: 1, row: 23, colSpan: 11, rowSpan: 5 },
  social: { col: 13, row: 23, colSpan: 7, rowSpan: 5 },
  marquee: { col: 21, row: 23, colSpan: 19, rowSpan: 5 },
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
