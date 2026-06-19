import { describe, expect, it } from "vitest";
import {
  BENTO_COLS,
  BENTO_ROWS,
  MOBILE_ORDER,
  resolveLayout,
  TILE_LAYOUT,
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
    // Незаданные поля тайла — из дефолта.
    expect(r.tiles.today.row).toBe(TILE_LAYOUT.today.row);
    // Другой тайл не тронут.
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

  it("неизвестные коду тайлы волны игнорируются (forward-compat)", () => {
    const r = resolveLayout({ tiles: { somethingNew: { col: 1, row: 1, colSpan: 2, rowSpan: 2 } } });
    expect(r.tiles).not.toHaveProperty("somethingNew");
  });

  it("волна задаёт размер грида и порядок мобильного стека", () => {
    const r = resolveLayout({ grid: { cols: 24, rows: 18 }, mobileOrder: ["music", "today"] });
    expect(r.cols).toBe(24);
    expect(r.rows).toBe(18);
    // Заданные — первыми, недостающие из дефолта — в хвосте (борд не теряет тайлы).
    expect(r.mobileOrder.slice(0, 2)).toEqual(["music", "today"]);
    expect(new Set(r.mobileOrder)).toEqual(new Set(MOBILE_ORDER));
  });

  it("неизвестные ключи в mobileOrder отбрасываются", () => {
    const r = resolveLayout({ mobileOrder: ["today", "bogus"] });
    expect(r.mobileOrder).not.toContain("bogus");
    expect(r.mobileOrder[0]).toBe("today");
  });
});
