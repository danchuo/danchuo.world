import type { CSSProperties } from "react";

/**
 * The bento grid's layout config — the TILE REGISTRY. Each tile declares its cell and span, and a
 * wave may override spans with no component change. The canvas is 40x28: the original 20x14 map
 * halved again so an empty track of air lies between every pair of neighbours. DESIGN §3
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
  | "marquee"
  | "feedback";

/**
 * A tile's content orientation. A field of its own rather than a deduction from span proportions:
 * a span is about space on the grid, orientation about how content flows through it. Only tiles
 * with both modes honour it; the rest ignore it silently and fall back to their own default.
 */
export type TileOrientation = "horizontal" | "vertical";

export interface TileSpan {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** A wave may hide a tile entirely — it renders in neither bento nor the stack. */
  hidden?: boolean;
  /** A wave may turn a tile's content (see [TileOrientation]). */
  orientation?: TileOrientation;
  /**
   * How project "planets" are dressed: `model` gives a 3D artifact to projects that have one,
   * anything else leaves every planet a flat sprite. A separate key from [edition] because an
   * edition is about the ROW's layout while this is about the ICON's material. DESIGN §12.5
   */
  planet?: string;
  /**
   * The tile's edition: the name of one of several layouts the tile knows itself. A string rather
   * than an enum here, because the set of editions is the TILE's knowledge and the registry knows
   * nothing of it; an unknown name means the default, and single-layout tiles ignore it. §10.1
   */
  edition?: string;
}

export const BENTO_COLS = 40;
export const BENTO_ROWS = 28;

/**
 * Wave 01 spans (DESIGN §3) on the 40×28 grid. The values are the original 20×14 map run through
 * `v → 2v−1` (see the file header), leaving an empty track between every pair of neighbours.
 */
export const TILE_LAYOUT: Record<TileId, TileSpan> = {
  // Brand signature plate retired from the board (owner's call) — kept in the registry hidden.
  identity: { col: 31, row: 1, colSpan: 9, rowSpan: 3, hidden: true },
  latestDrop: { col: 1, row: 1, colSpan: 10, rowSpan: 11 },
  // Freshness lamp under the envelope, dropped a track so the pair keeps a gutter between them
  // and still clears the bottom edge.
  freshness: { col: 32, row: 25, colSpan: 3, rowSpan: 4 },
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
  // Projects — narrow vertical column hugging the right wall below the calendar. rowSpan 6
  // stops one track short of the grid's last row (row-end 28 of 29) — deliberate breathing room.
  projects: { col: 36, row: 22, colSpan: 5, rowSpan: 6 },
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
  // A caption over a glyph needs no more room than this. Placed so exactly one track of air
  // falls between it and each of its three neighbours: calendar, freshness, projects.
  feedback: { col: 31, row: 21, colSpan: 3, rowSpan: 3 },
};

/** Order of the single-column stack on mobile (<640px, DESIGN §8). */
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
  "feedback",
  "freshness",
];

/** CSS grid-area for a tile (`row / col / row-end / col-end`). */
export function gridArea(span: TileSpan): string {
  return `${span.row} / ${span.col} / ${span.row + span.rowSpan} / ${span.col + span.colSpan}`;
}

/**
 * Tiles whose height comes from their CONTENT, with the span acting only as a ceiling. The
 * projects list is short and changes quarterly: stretched across its span it left half a tile of
 * blank, promising content that was not there. A property of the tile, not the wave. DESIGN §7.8
 */
export const CONTENT_HEIGHT_TILES: ReadonlySet<TileId> = new Set<TileId>(["projects"]);

/** How a tile fills its bento cell: [cell] is the grid wrapper, [tile] the widget inside it. */
export interface TileBox {
  cell: CSSProperties;
  tile: CSSProperties;
}

/**
 * Style of the cell and of the tile within it. By default a tile stretches across its whole span —
 * it takes what it was given. A tile from [CONTENT_HEIGHT_TILES] is sized by its content, with the
 * span as its ceiling.
 */
export function tileBox(id: TileId, span: TileSpan): TileBox {
  const cell: CSSProperties = { gridArea: gridArea(span), minHeight: 0 };
  if (!CONTENT_HEIGHT_TILES.has(id)) return { cell, tile: { height: "100%", width: "100%" } };
  return {
    cell: {
      ...cell,
      // `align-self: start` removes the stretch and `max-height` restores the ceiling: a percentage
      // on a grid item resolves against the CELL, which the board does define. The flex column then
      // lets a tile at its ceiling SHRINK to it instead of spilling, and the list scrolls inside.
      alignSelf: "start",
      maxHeight: "100%",
      display: "flex",
      flexDirection: "column",
    },
    // The tile's height is NOT set: the content is the height. Width fills the cell, as for all.
    tile: { width: "100%" },
  };
}

/* A wave may carry its own layout and override the default below: move, resize and HIDE tiles,
 * change the grid size and the mobile stack order. Waves live in `lib/waves/` — a delta of the map
 * above, merged OVER it, so a tile added later gets a position on older waves too.
 */

/** A tile's span from a wave: every field is optional, so a wave states only what it changes. */
export interface WaveTileSpan {
  col?: number;
  row?: number;
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
  orientation?: TileOrientation;
  edition?: string;
  planet?: string;
}

/** A wave's layout block (`Wave.layout`); every field is optional and falls back below. */
export interface WaveLayout {
  grid?: { cols?: number; rows?: number };
  tiles?: Partial<Record<TileId, WaveTileSpan>>;
  mobileOrder?: TileId[];
  /**
   * Drop gallery edition (DESIGN §10.1): `mosaic` (default) or `roll`, the reel. A field of the wave
   * rather than of a tile, because the gallery is opened BOTH by the latest-drop tile and by the rail
   * of past drops, and a wave has one edition — otherwise one drop would open differently by entry point.
   */
  gallery?: string;
}

/** The resolved layout (a wave merged over the default) — what the board renders from. */
export interface ResolvedLayout {
  cols: number;
  rows: number;
  tiles: Record<TileId, TileSpan>;
  mobileOrder: TileId[];
  /** Drop gallery edition; the default is `mosaic` (see [WaveLayout.gallery]). */
  gallery: string;
}

/** Tiles a wave may NOT hide, or wave switching itself could be locked away. */
const UNHIDEABLE: ReadonlySet<TileId> = new Set<TileId>(["waveSwitcher"]);

const ALL_TILE_IDS = Object.keys(TILE_LAYOUT) as TileId[];

/**
 * Merges a wave's layout over the default and returns a resolved one. A SPAN IS ASSEMBLED FIELD BY
 * FIELD, so a NEW field of [WaveTileSpan] must be carried here explicitly — a forgotten one is
 * lost silently, as a fallback to default, which looks like "the wave did not work". DESIGN §3, §10
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
      orientation: ov?.orientation ?? base.orientation,
      edition: ov?.edition ?? base.edition,
      planet: ov?.planet ?? base.planet,
    };
  }

  const waveOrder = wave?.mobileOrder ?? [];
  const seen = new Set(waveOrder);
  const mobileOrder =
    waveOrder.length > 0
      ? [...waveOrder, ...MOBILE_ORDER.filter((id) => !seen.has(id))]
      : [...MOBILE_ORDER];

  return {
    cols: wave?.grid?.cols ?? BENTO_COLS,
    rows: wave?.grid?.rows ?? BENTO_ROWS,
    gallery: wave?.gallery ?? "mosaic",
    tiles,
    mobileOrder,
  };
}
