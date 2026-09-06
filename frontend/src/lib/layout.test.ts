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

  it("волна может развернуть тайл (orientation), дефолт — ориентация не задана", () => {
    const r = resolveLayout({ tiles: { marquee: { orientation: "vertical" } } });
    expect(r.tiles.marquee.orientation).toBe("vertical");
    // Без переопределения — undefined (тайл рендерит свой дефолт).
    expect(r.tiles.social.orientation).toBeUndefined();
  });

  it("волна может выбрать редакцию тайла (edition); дефолт — редакция не задана", () => {
    const r = resolveLayout({ tiles: { latestDrop: { edition: "frame" } } });
    expect(r.tiles.latestDrop.edition).toBe("frame");
    expect(r.tiles.music.edition).toBeUndefined();
  });

  it("волна может выбрать планету проектов (planet); дефолт — не задана", () => {
    // ⚠️ Регрессия: каждое поле контракта раскладки надо ПЕРЕНЕСТИ здесь явно — мерж собирает
    // спан по одному полю, и забытый ключ волна теряет молча (на 3D-планетах так и вышло:
    // ключ доехал из БД до API и оборвался ровно тут).
    const r = resolveLayout({ tiles: { projects: { planet: "model" } } });
    expect(r.tiles.projects.planet).toBe("model");
    expect(r.tiles.music.planet).toBeUndefined();
  });

  it("битое значение planet отбрасывается — остаётся плоский спрайт", () => {
    for (const v of [42, "", "  ", "МОДЕЛЬ", "a".repeat(40)]) {
      expect(
        resolveLayout({ tiles: { projects: { planet: v as unknown as string } } }).tiles.projects.planet,
      ).toBeUndefined();
    }
  });

  it("битое значение edition отбрасывается: не строка, пустая строка, мусор", () => {
    const bad = (v: unknown) =>
      resolveLayout({ tiles: { latestDrop: { edition: v as unknown as string } } }).tiles.latestDrop.edition;
    expect(bad(42)).toBeUndefined();
    expect(bad("")).toBeUndefined();
    expect(bad("Frame Edition!")).toBeUndefined();
    expect(bad("x".repeat(40))).toBeUndefined();
  });

  it("битое значение orientation из JSON волны отбрасывается", () => {
    const r = resolveLayout({
      tiles: { marquee: { orientation: "diagonal" as unknown as "vertical" } },
    });
    expect(r.tiles.marquee.orientation).toBeUndefined();
  });
});
