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
}

/** Ширины CSS-вьюпорта, которые даёт зум на типовом окне 1512px (1512 / zoom). */
const ZOOM_ON_1512 = [
  { zoom: "90%", width: 1680, height: 1000, expected: "BENTO" },
  { zoom: "100%", width: 1512, height: 900, expected: "BENTO" },
  { zoom: "110%", width: 1375, height: 818, expected: "BENTO" },
  { zoom: "125%", width: 1210, height: 720, expected: "BENTO" },
  // Ниже страховочного пола 1100px bento перестаёт читаться — штатно уходим в стек.
  { zoom: "150%", width: 1008, height: 600, expected: "STACK" },
] as const;

test.describe("выбор режима борда", () => {
  for (const c of ZOOM_ON_1512) {
    test(`мышь, зум ${c.zoom} (${c.width}px) → ${c.expected}`, async ({ page }) => {
      await page.setViewportSize({ width: c.width, height: c.height });
      await openBoard(page);
      expect(await boardMode(page)).toBe(c.expected);
    });
  }

  // Тач получает стек при ЛЮБОЙ ширине: планшет в альбомной (1366px) шире порога 1100,
  // но пальцем по bento 40×28 не попасть — решает указатель, а не то, что окно широкое.
  for (const d of [
    { label: "телефон 375px", width: 375, height: 812 },
    { label: "планшет 1366px", width: 1366, height: 1024 },
  ]) {
    test(`тач, ${d.label} → STACK`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: d.width, height: d.height },
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await openBoard(page);
      expect(await boardMode(page)).toBe("STACK");
      await ctx.close();
    });
  }
});
