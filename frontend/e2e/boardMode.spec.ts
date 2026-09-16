import { test, expect, type Page } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * The board mode is chosen by POINTER TYPE, not width (DESIGN §8, common.css). Browser zoom does
 * not enlarge the picture, it shrinks the CSS viewport, so while the switch went by width one
 * zoom step dropped the whole board into the phone stack. A pointer is immune to zoom.
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
  // The font gate (DESIGN §7.10): the board is hidden until the wave's fonts arrive. Without this
  // wait a snapshot catches an empty space, or races the change of typeface.
  await page.waitForFunction(() => document.documentElement.dataset.fonts !== "pending");
}

/**
 * The pointer type is set by OUR OWN context rather than the project's settings: the spec runs on
 * both playwright.config projects and the mobile one sets `hasTouch`, so mouse cases would
 * silently check the wrong thing. Setting it explicitly makes the result project-independent.
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
 * CSS viewport widths that zoom produces on a typical 1512px window (1512 / zoom). There is
 * deliberately NO width threshold: the desktop stays bento at any zoom, and 200% is the extreme.
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

  // Touch gets the stack at ANY width: a tablet in landscape is wider than any sensible
  // threshold, but a finger cannot hit a 40×28 bento — the pointer decides, not the width.
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
