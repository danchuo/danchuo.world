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
  | "sleep"
  | "today"
  | "calendar"
  | "projects"
  | "ride"
  | "hero"
  | "social"
  | "marquee";

/**
 * Ориентация содержимого тайла. Отдельное поле, а не вывод из пропорций спана: спан — про
 * место на сетке, ориентация — про то, как контент по нему течёт (лента может быть и широкой
 * вертикальной). Уважают её только тайлы, у которых есть оба режима (сейчас — marquee);
 * остальные молча игнорируют. Не задана ⇒ дефолт самого тайла.
 */
export type TileOrientation = "horizontal" | "vertical";

export interface TileSpan {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** Волна может скрыть тайл целиком (не рендерится ни в bento, ни в стеке). */
  hidden?: boolean;
  /** Волна может развернуть контент тайла (см. [TileOrientation]). */
  orientation?: TileOrientation;
  /**
   * Редакция тайла (DESIGN §10.1): имя одной из нескольких вёрсток, которые тайл умеет сам
   * (`latestDrop`: `mosaic` | `frame` | `sheet`). Строка, а не перечисление здесь: набор
   * редакций — знание тайла, реестр раскладки о нём не знает; незнакомое имя тайл трактует
   * как дефолт. Тайлы с одной вёрсткой поле молча игнорируют.
   */
  edition?: string;
}

export const BENTO_COLS = 40;
export const BENTO_ROWS = 28;

/**
 * Спаны волны 01 (DESIGN §3) на сетке 40×28. Значения = исходная карта 20×14, прогнанная
 * через `v → 2v−1` (см. шапку файла): между каждой парой соседей — пустой трек-прослойка.
 */
export const TILE_LAYOUT: Record<TileId, TileSpan> = {
  // Brand signature plate retired from the board (owner's call) — kept in the registry hidden.
  identity: { col: 31, row: 1, colSpan: 9, rowSpan: 3, hidden: true },
  latestDrop: { col: 1, row: 1, colSpan: 10, rowSpan: 11 },
  // Freshness lamp in the bottom band between the marquee and the sleep strip (the slot
  // the social grid vacated).
  freshness: { col: 30, row: 24, colSpan: 3, rowSpan: 4 },
  // Wave switcher tucked just left of today's top-left corner, top-aligned with today (row 8).
  // Grown one track upward (row 20 → 19) to give the wave chips room; the gutter track below
  // the social grid (which ends at row 17) survives, so the channel still breathes.
  waveSwitcher: { col: 9, row: 19, colSpan: 3, rowSpan: 4 },
  // Spotify moved to the right of the drops strip, into the top-right band the wave/freshness
  // stack vacated (above the calendar).
  music: { col: 12, row: 1, colSpan: 8, rowSpan: 5 },
  // Horizontal drops strip in the top band, flush with today's right edge: covers + readable
  // titles instead of the old narrow vertical column (titles used to truncate to nothing).
  // Two full cards + a chunk of the third — the cut-off card is the scroll affordance.
  photoDrops: { col: 23, row: 1, colSpan: 7, rowSpan: 6, orientation: "horizontal" },
  // Lower-left cluster below the latest-drop tile: projects (narrow, left) + stats (right of it,
  // one gutter before today). Sleep drops to the very bottom band, right of projects/stats.
  // Stats and sleep each nudged one track down.
  stats: { col: 31, row: 1, colSpan: 10, rowSpan: 8 },
  sleep: { col: 17, row: 24, colSpan: 12, rowSpan: 5 },
  today: { col: 13, row: 8, colSpan: 15, rowSpan: 15 },
  // Calendar nudged up one track so its top lines up with today (row 8).
  calendar: { col: 29, row: 10, colSpan: 9, rowSpan: 10 },
  // Projects — narrow vertical column at the bottom-right edge, below the calendar. rowSpan 6
  // stops one track short of the grid's last row (row-end 28 of 29) — deliberate breathing room.
  projects: { col: 34, row: 22, colSpan: 5, rowSpan: 6 },
  // Ride swapped with stats to the bottom-right, hugging the right wall below the calendar.
  ride: { col: 1, row: 13, colSpan: 7, rowSpan: 10 },
  // Hero is retired from the board for now (owner's call); the slot went to the layout above.
  hero: { col: 10, row: 23, colSpan: 3, rowSpan: 5, hidden: true },
  // Social stamp-grid in the channel between the ride tile and today, above the wave
  // switcher — a more visible slot for the wave-01 colored sprites.
  social: { col: 9, row: 13, colSpan: 3, rowSpan: 5 },
  // The artifacts marquee footer, grown one track upward, slid right to sit one gutter left of
  // the ride tile (col-end 33 → gutter col 33 → ride at col 34).
  marquee: { col: 1, row: 24, colSpan: 12, rowSpan: 5 },
};

/** Порядок одноколоночного стека на мобиле (<640px, DESIGN §8). */
export const MOBILE_ORDER: TileId[] = [
  "today",
  "calendar",
  "stats",
  "sleep",
  "music",
  "ride",
  "latestDrop",
  "photoDrops",
  "projects",
  "social",
  "hero",
  "marquee",
  "waveSwitcher",
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
  orientation?: TileOrientation;
  edition?: string;
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

/** Ориентация из JSON волны: всё, кроме валидных значений, ⇒ `undefined` (дефолт тайла). */
function sanitizeOrientation(value: unknown): TileOrientation | undefined {
  return value === "horizontal" || value === "vertical" ? value : undefined;
}

/** Имя редакции из JSON волны: короткий kebab-case идентификатор, всё остальное ⇒ `undefined`. */
function sanitizeEdition(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value) ? value : undefined;
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
      // Битые значения из JSON волны отбрасываем — тайл вернётся к своему дефолту.
      orientation: sanitizeOrientation(ov?.orientation) ?? base.orientation,
      edition: sanitizeEdition(ov?.edition) ?? base.edition,
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
