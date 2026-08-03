import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Путь от корня проекта: под jsdom `import.meta.url` не файловый, fileURLToPath на нём падает.
const css = readFileSync(resolve(process.cwd(), "src/app/styles/common.css"), "utf8");

/** Тело правила по точному селектору (первое вхождение). */
function ruleBody(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `правило ${selector} не найдено в common.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/**
 * Собственная высота блоков, которым её не даёт родитель (DESIGN §8).
 *
 * В бенто борд прибит к вьюпорту и каждый тайл получает `height: 100%` — «сколько осталось»
 * там определено, и `flex: 1` внутри честно раскрывается. В мобильном СТЕКЕ у тайла высоты нет
 * (она по контенту), поэтому блок, вся высота которого выведена из родителя, схлопывается в
 * ноль: контент есть в DOM, но не виден. Так молча пропадали мозаика последнего дропа, список
 * недавних треков, мини-карта поездки и сцена выходного — jsdom геометрию не считает, а
 * мобильные Playwright-эталоны сняли поломку как норму.
 *
 * Отсюда контракт: у каждого такого блока в CSS есть СВОЯ высота (`aspect-ratio` или
 * `min-height`) — она работает ровно там, где родитель молчит, и уступает flex-раскладке,
 * когда высота у родителя есть. Первым это правило получил `.quest-map` (карта-тропа).
 */
describe("собственная высота блоков в мобильном стеке (DESIGN §8)", () => {
  const intrinsic = /aspect-ratio|min-height/;

  it.each([
    [".quest-map", "карта-тропа «Сегодня» (эталон приёма)"],
    [".weekend-scene", "сцена выходного — все её слои absolute, своего контента по высоте нет"],
    [".drop-mosaic", "мозаика последнего дропа — без высоты расчёт рядов не стартует вовсе"],
    [".board-stack .music-recent", "список недавних треков — лежит absolute inset-0 в своей обёртке"],
    [".ride-map-box", "мини-карта поездки — Leaflet в контейнере нулевой высоты не рисует ничего"],
  ])("%s несёт собственную высоту (%s)", (selector) => {
    expect(ruleBody(selector)).toMatch(intrinsic);
  });

  it("min-height подпорка ограничена стеком — в бенто она бы не уступила flex-раскладке", () => {
    // `aspect-ratio` действует только при неопределённом размере и потому безвреден в бенто.
    // `min-height` не уступает никому: он перебивает `min-h-0` на самом элементе (правило вне
    // @layer сильнее утилит), список переставал сжиматься и свисал ниже края плитки — нижнюю
    // строку срезал сам край. Поэтому подпорка на min-height обязана быть под `.board-stack`.
    const globalMinHeight = /\n\.music-recent \{/;
    expect(css).not.toMatch(globalMinHeight);
  });
});
