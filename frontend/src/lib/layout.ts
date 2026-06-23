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
  | "latestDrop"
  | "waveSwitcher"
  | "freshness"
  | "music"
  | "stats"
  | "today"
  | "calendar"
  | "projects"
  | "ride"
  | "hero"
  | "social"
  | "marquee";

export interface TileSpan {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** Волна может скрыть тайл целиком (не рендерится ни в bento, ни в стеке). */
  hidden?: boolean;
}

export const BENTO_COLS = 40;
export const BENTO_ROWS = 28;

/**
 * Спаны волны 01 (DESIGN §3) на сетке 40×28. Значения = исходная карта 20×14, прогнанная
 * через `v → 2v−1` (см. шапку файла): между каждой парой соседей — пустой трек-прослойка.
 */
export const TILE_LAYOUT: Record<TileId, TileSpan> = {
  identity: { col: 2, row: 13, colSpan: 6, rowSpan: 3 },
  latestDrop: { col: 1, row: 1, colSpan: 10, rowSpan: 11 },
  waveSwitcher: { col: 32, row: 1, colSpan: 4, rowSpan: 3 },
  freshness: { col: 37, row: 1, colSpan: 3, rowSpan: 3 },
  music: { col: 22, row: 1, colSpan: 8, rowSpan: 4 },
  photoDrops: { col: 10, row: 13, colSpan: 3, rowSpan: 9 },
  stats: { col: 1, row: 13, colSpan: 8, rowSpan: 4 },
  today: { col: 14, row: 6, colSpan: 16, rowSpan: 16 },
  calendar: { col: 31, row: 5, colSpan: 9, rowSpan: 11 },
  projects: { col: 31, row: 17, colSpan: 9, rowSpan: 5 },
  ride: { col: 1, row: 18, colSpan: 8, rowSpan: 7 },
  hero: { col: 10, row: 23, colSpan: 3, rowSpan: 5 },
  social: { col: 14, row: 23, colSpan: 7, rowSpan: 5 },
  marquee: { col: 23, row: 23, colSpan: 15, rowSpan: 5 },
};

/** Порядок одноколоночного стека на мобиле (<640px, DESIGN §8). */
export const MOBILE_ORDER: TileId[] = [
  "today",
  "calendar",
  "stats",
  "music",
  "ride",
  "latestDrop",
  "photoDrops",
  "projects",
  "social",
  "hero",
  "marquee",
  "freshness",
];

/** CSS grid-area для тайла (`row / col / row-end / col-end`). */
export function gridArea(span: TileSpan): string {
  return `${span.row} / ${span.col} / ${span.row + span.rowSpan} / ${span.col + span.colSpan}`;
}

/* ─────────────────────────── Layout-per-wave (DESIGN §3, §10) ───────────────────────────
 * Волна может нести свой layout (`ThemeView.layout`) и переопределять дефолт ниже: переставлять,
 * ресайзить и **прятать** тайлы, менять размер грида и порядок мобильного стека. Реестр тайлов
 * (`TileId`) остаётся за кодом — новый тайл = новый компонент; волна лишь раскладывает уже
 * существующие. Поэтому всё мержится ПОВЕРХ дефолта: волна задаёт только дельту, а тайлы,
 * добавленные в код позже, автоматически получают позицию даже на старых волнах (борд не ломается).
 */

/** Спан тайла из волны: каждое поле опционально — волна задаёт только то, что меняет. */
export interface WaveTileSpan {
  col?: number;
  row?: number;
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
}

/** Layout-блок волны (`ThemeView.layout`); любое поле опционально (фолбэк — дефолт ниже). */
export interface WaveLayout {
  grid?: { cols?: number; rows?: number };
  /** Ключи — машинные id тайлов; неизвестные коду игнорируются (forward-compat). */
  tiles?: Record<string, WaveTileSpan>;
  mobileOrder?: string[];
}

/** Разрешённый layout (волна, смерженная с дефолтом) — на нём рендерит борд. */
export interface ResolvedLayout {
  cols: number;
  rows: number;
  tiles: Record<TileId, TileSpan>;
  mobileOrder: TileId[];
}

/** Тайлы, которые волна прятать НЕ вправе — иначе можно залочить переключение волн. */
const UNHIDEABLE: ReadonlySet<TileId> = new Set<TileId>(["waveSwitcher"]);

const ALL_TILE_IDS = Object.keys(TILE_LAYOUT) as TileId[];

function isTileId(key: string): key is TileId {
  return Object.prototype.hasOwnProperty.call(TILE_LAYOUT, key);
}

/**
 * Мержит layout волны поверх дефолта [TILE_LAYOUT] и отдаёт готовый [ResolvedLayout].
 * `null`/`undefined` (нет активной волны / бэк недоступен / волна без layout) ⇒ чистый дефолт
 * — graceful degradation, зеркалит фолбэк токенов на `globals.css`. Неизвестные коду тайлы
 * волны игнорируются; недостающие в mobileOrder добавляются в хвост по дефолтному порядку.
 */
export function resolveLayout(wave?: WaveLayout | null): ResolvedLayout {
  const tiles = {} as Record<TileId, TileSpan>;
  for (const id of ALL_TILE_IDS) {
    const base = TILE_LAYOUT[id];
    const ov = wave?.tiles?.[id];
    tiles[id] = {
      col: ov?.col ?? base.col,
      row: ov?.row ?? base.row,
      colSpan: ov?.colSpan ?? base.colSpan,
      rowSpan: ov?.rowSpan ?? base.rowSpan,
      hidden: (ov?.hidden ?? base.hidden ?? false) && !UNHIDEABLE.has(id),
    };
  }

  const waveOrder = (wave?.mobileOrder ?? []).filter(isTileId);
  const seen = new Set(waveOrder);
  const mobileOrder =
    waveOrder.length > 0
      ? [...waveOrder, ...MOBILE_ORDER.filter((id) => !seen.has(id))]
      : [...MOBILE_ORDER];

  return {
    cols: wave?.grid?.cols ?? BENTO_COLS,
    rows: wave?.grid?.rows ?? BENTO_ROWS,
    tiles,
    mobileOrder,
  };
}
