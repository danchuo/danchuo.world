import { describe, expect, it } from "vitest";
import {
  BENTO_COLS,
  BENTO_ROWS,
  gridArea,
  MOBILE_ORDER,
  resolveLayout,
  TILE_LAYOUT,
  tileBox,
} from "./layout";

describe("resolveLayout", () => {
  it("без волны (null) → чистый дефолт layout.ts", () => {
    const r = resolveLayout(null);
    expect(r.cols).toBe(BENTO_COLS);
    expect(r.rows).toBe(BENTO_ROWS);
    expect(r.tiles.today).toEqual({ ...TILE_LAYOUT.today, hidden: false });
    expect(r.mobileOrder).toEqual(MOBILE_ORDER);
  });

  it("волна переопределяет спан одного тайла, остальные — дефолт", () => {
    const r = resolveLayout({ tiles: { today: { col: 2, colSpan: 5 } } });
    expect(r.tiles.today.col).toBe(2);
    expect(r.tiles.today.colSpan).toBe(5);
    // Fields the tile does not set come from the default.
    expect(r.tiles.today.row).toBe(TILE_LAYOUT.today.row);
    // Another tile is untouched.
    expect(r.tiles.music).toEqual({ ...TILE_LAYOUT.music, hidden: false });
  });

  it("волна может скрыть тайл", () => {
    const r = resolveLayout({ tiles: { stats: { hidden: true } } });
    expect(r.tiles.stats.hidden).toBe(true);
  });

  it("переключатель волн нельзя спрятать (защита от лока)", () => {
    const r = resolveLayout({ tiles: { waveSwitcher: { hidden: true } } });
    expect(r.tiles.waveSwitcher.hidden).toBe(false);
  });

  it("волна задаёт размер грида и порядок мобильного стека", () => {
    const r = resolveLayout({ grid: { cols: 24, rows: 18 }, mobileOrder: ["music", "today"] });
    expect(r.cols).toBe(24);
    expect(r.rows).toBe(18);
    // Named ones first, the missing defaults in the tail — the board loses no tiles.
    expect(r.mobileOrder.slice(0, 2)).toEqual(["music", "today"]);
    expect(new Set(r.mobileOrder)).toEqual(new Set(MOBILE_ORDER));
  });

  it("волна может развернуть тайл (orientation), дефолт — ориентация не задана", () => {
    const r = resolveLayout({ tiles: { marquee: { orientation: "vertical" } } });
    expect(r.tiles.marquee.orientation).toBe("vertical");
    // With no override it is undefined and the tile renders its own default.
    expect(r.tiles.social.orientation).toBeUndefined();
  });

  it("волна может выбрать редакцию тайла (edition); дефолт — редакция не задана", () => {
    const r = resolveLayout({ tiles: { latestDrop: { edition: "frame" } } });
    expect(r.tiles.latestDrop.edition).toBe("frame");
    expect(r.tiles.music.edition).toBeUndefined();
  });

  it("волна может выбрать планету проектов (planet); дефолт — не задана", () => {
    // ⚠️ A regression: every field of the layout contract must be CARRIED OVER explicitly here.
    // The merge assembles a span field by field, and a forgotten key is lost silently — which is
    // what happened to 3D planets, when the field list ran through the backend as well.
    const r = resolveLayout({ tiles: { projects: { planet: "model" } } });
    expect(r.tiles.projects.planet).toBe("model");
    expect(r.tiles.music.planet).toBeUndefined();
  });

});

/**
 * A tile's height in its bento cell: by span (all of them) or by content with the span as a
 * ceiling (projects). It is the tile's own property, not the wave's, so it is also checked on a
 * span the wave has recut.
 */
describe("tileBox — как тайл занимает свою ячейку", () => {
  it("обычный тайл растянут на весь спан", () => {
    const box = tileBox("today", TILE_LAYOUT.today);
    expect(box.cell.gridArea).toBe(gridArea(TILE_LAYOUT.today));
    expect(box.cell.alignSelf).toBeUndefined();
    expect(box.tile.height).toBe("100%");
  });

  it("проекты меряются содержимым, а спан им только потолок", () => {
    const box = tileBox("projects", TILE_LAYOUT.projects);
    expect(box.cell.gridArea).toBe(gridArea(TILE_LAYOUT.projects));
    // The grid item's stretch is removed and the ceiling stays: the percentage is of the span's cell.
    expect(box.cell.alignSelf).toBe("start");
    expect(box.cell.maxHeight).toBe("100%");
    // The tile has no height of its own — the list inside gives it one.
    expect(box.tile.height).toBeUndefined();
    expect(box.tile.width).toBe("100%");
  });

  it("потолок берётся из спана ВОЛНЫ, а не из дефолта", () => {
    const r = resolveLayout({ tiles: { projects: { row: 4, rowSpan: 12 } } });
    const box = tileBox("projects", r.tiles.projects);
    expect(box.cell.gridArea).toBe(gridArea(r.tiles.projects));
    expect(box.cell.maxHeight).toBe("100%");
  });
});
