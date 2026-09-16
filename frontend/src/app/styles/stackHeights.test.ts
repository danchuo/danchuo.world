import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A path from the project root: under jsdom `import.meta.url` is not a file URL and fileURLToPath fails.
const css = readFileSync(resolve(process.cwd(), "src/app/styles/common.css"), "utf8");

function ruleBody(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `правило ${selector} не найдено в common.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/**
 * Own height for blocks whose parent does not give them one (DESIGN §8). In bento the board is
 * pinned to the viewport and every tile gets `height: 100%`; in the mobile STACK a tile's height
 * comes from content, so a block deriving its height from the parent collapses to zero.
 */

/**
 * Hence the contract: every such block carries its OWN height in CSS (`aspect-ratio` or
 * `min-height`), which works exactly where the parent is silent and yields to flex when it is not.
 */
describe("собственная высота блоков в мобильном стеке (DESIGN §8)", () => {
  const intrinsic = /aspect-ratio|min-height/;

  it.each([
    [".quest-map", "карта-тропа «Сегодня» (эталон приёма)"],
    [".weekend-scene", "сцена выходного — все её слои absolute, своего контента по высоте нет"],
    [".drop-mosaic", "мозаика последнего дропа — без высоты расчёт рядов не стартует вовсе"],
    [".board-stack .music-recent", "список недавних треков — лежит absolute inset-0 в своей обёртке"],
    [".ride-map-box", "мини-карта поездки — Leaflet в контейнере нулевой высоты не рисует ничего"],
    [".ride-frame", "карта во всю плитку (редакция `map`) — та же беда Leaflet, только на весь виджет"],
  ])("%s несёт собственную высоту (%s)", (selector) => {
    expect(ruleBody(selector)).toMatch(intrinsic);
  });

  it("min-height подпорка ограничена стеком — в бенто она бы не уступила flex-раскладке", () => {
    // `aspect-ratio` only acts on an undefined size and is therefore harmless in bento.
    // `min-height` yields to nobody: it beat `min-h-0` on the element itself, the list stopped
    // shrinking and hung past the tile's edge. So it must live under `.board-stack`.
    const globalMinHeight = /\n\.music-recent \{/;
    expect(css).not.toMatch(globalMinHeight);
  });
});

/**
 * The same §8 contract for WAVE material. A wave may redraw a block so that no height of its own
 * is left — a cover laid out as an absolute square, a map painted in absolute layers. In bento the
 * tile gives them height, in the stack nobody does, and the widget collapses to a strip.
 */
describe("собственная высота блоков волны в мобильном стеке (DESIGN §8, §10.2)", () => {
  /** The rule (selectors plus body) whose selector mentions `.board-stack`. Comments do not count. */
  function stackRule(wave: string): string {
    const waveCss = readFileSync(resolve(process.cwd(), `src/app/styles/waves/${wave}.css`), "utf8");
    const match = waveCss.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]*\.board-stack[^{}]*\{[^}]*\}/);
    expect(match, `правило под .board-stack не найдено в ${wave}.css`).not.toBeNull();
    return match![0];
  }

  it("волна 02: карточка музыки с обложкой — квадрат (обложка лежит абсолютным слоем)", () => {
    const rule = stackRule("wave-02");
    expect(rule).toContain('[data-music-art="ok"]');
    expect(rule).toMatch(/aspect-ratio:\s*1/);
  });

  it("волна 03: карта волны в переключателе несёт свою высоту (вся карта — абсолютные слои)", () => {
    const rule = stackRule("wave-03");
    expect(rule).toContain(".wave-chip");
    expect(rule).toMatch(/aspect-ratio|min-height/);
  });
});
