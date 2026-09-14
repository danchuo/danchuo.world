import { test, expect, type Page } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * Режим борда выбирается ТИПОМ УКАЗАТЕЛЯ, а не шириной (DESIGN §8, common.css).
 * Это не визуальная регрессия — эталоны не нужны; тест закрепляет саму развилку,
 * которую jsdom-юниты не видят (медиа-запросы `pointer`/`hover` живут только в браузере).
 *
 * Зачем: браузерный зум не увеличивает картинку, он ужимает CSS-вьюпорт (110% на окне
 * 1512px отдаёт 1375px). Пока развилка шла по ширине, один шаг зума ронял весь борд
 * в телефонный стек. Указатель зуму неподвластен.
 */
async function boardMode(page: Page): Promise<"BENTO" | "STACK"> {
  const display = await page
    .locator('[data-testid="bento"]')
    .evaluate((el) => getComputedStyle(el).display);
  return display === "grid" ? "BENTO" : "STACK";
}

async function openBoard(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await stubApi(page);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // Ворота шрифта (DESIGN §7.10): борд скрыт, пока не приехали шрифты волны. Без этого
  // ожидания снимок успевает застать пустое место — а раньше ловил гонку со сменой
  // начертания, то есть эталоны были нестабильны и до ворот.
  await page.waitForFunction(() => document.documentElement.dataset.fonts !== "pending");
}

/**
 * Тип указателя задаём СВОИМ контекстом, а не настройками проекта: спека гоняется на обоих
 * проектах playwright.config, и у мобильного стоит `hasTouch` — «мышиные» кейсы под ним
 * молча проверяли бы не то (и падали). Здесь развилка задаётся явно, поэтому результат
 * одинаков в любом проекте.
 */
async function modeFor(
  browser: import("@playwright/test").Browser,
  viewport: { width: number; height: number },
  hasTouch: boolean,
) {
  const ctx = await browser.newContext({ viewport, hasTouch });
  const page = await ctx.newPage();
  await openBoard(page);
  const m = await boardMode(page);
  await ctx.close();
  return m;
}

/**
 * Ширины CSS-вьюпорта, которые даёт зум на типовом окне 1512px (1512 / zoom).
 * Порога по ширине НЕТ намеренно: десктоп остаётся бенто на любом зуме (решение владельца —
 * крупные сайты не подменяют раскладку под пользователем). 200% включён как крайний случай.
 */
const ZOOM_ON_1512 = [
  { zoom: "90%", width: 1680, height: 1000 },
  { zoom: "100%", width: 1512, height: 900 },
  { zoom: "110%", width: 1375, height: 818 },
  { zoom: "125%", width: 1210, height: 720 },
  { zoom: "150%", width: 1008, height: 600 },
  { zoom: "200%", width: 756, height: 450 },
] as const;

test.describe("выбор режима борда", () => {
  for (const c of ZOOM_ON_1512) {
    test(`мышь, зум ${c.zoom} (${c.width}px) → BENTO`, async ({ browser }) => {
      const mode = await modeFor(browser, { width: c.width, height: c.height }, false);
      expect(mode).toBe("BENTO");
    });
  }

  // Тач получает стек при ЛЮБОЙ ширине: планшет в альбомной (1366px) заметно шире любого
  // разумного порога, но пальцем по bento 40×28 не попасть — решает указатель, а не ширина.
  for (const d of [
    { label: "телефон 375px", width: 375, height: 812 },
    { label: "планшет 1366px", width: 1366, height: 1024 },
  ]) {
    test(`тач, ${d.label} → STACK`, async ({ browser }) => {
      const mode = await modeFor(browser, { width: d.width, height: d.height }, true);
      expect(mode).toBe("STACK");
    });
  }
});
