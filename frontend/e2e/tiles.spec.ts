import { test, expect } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * Per-tile visual regression (PRD §12). Each tile is shot by its `aria-label` rather than the
 * whole board, so diffs stay local. One pass per project with soft asserts: a single diverged
 * tile does not hide the others.
 */

interface Tile {
  label: string;
  slug: string;
}

/**
 * The "Today" tile is shot by a SEPARATE test below: the fixtures' frozen now is a Sunday, so the
 * shared pass would only ever baseline the weekend scene and leave the quest map — the board's
 * dominant and liveliest element — without any visual regression at all.
 */
const TODAY_TILE = "Сегодня";

/** Desktop: the full bento (see TILE_LAYOUT in layout.ts). */
const DESKTOP: Tile[] = [
  { label: "Статы — активность", slug: "stats" },
  { label: "Сон", slug: "sleep" },
  { label: "Календарь", slug: "calendar" },
  { label: "Музыка", slug: "music" },
  { label: "Последняя поездка на Велобайке", slug: "ride" },
  { label: "Проекты", slug: "projects" },
  { label: "Соцсети", slug: "social" },
  { label: "Артефакты", slug: "marquee" },
  { label: "Фото-дропы", slug: "photoDrops" },
  { label: "Последний фото-дроп", slug: "latestDrop" },
  { label: "Свежесть данных", slug: "freshness" },
  { label: "Переключатель волн", slug: "waveSwitcher" },
];

/** Mobile: the MOBILE_ORDER stack (the calendar is the same week grid as in bento). */
const MOBILE: Tile[] = [
  { label: "Календарь", slug: "calendar" },
  { label: "Статы — активность", slug: "stats" },
  { label: "Сон", slug: "sleep" },
  { label: "Музыка", slug: "music" },
  { label: "Последняя поездка на Велобайке", slug: "ride" },
  { label: "Последний фото-дроп", slug: "latestDrop" },
  { label: "Фото-дропы", slug: "photoDrops" },
  { label: "Проекты", slug: "projects" },
  { label: "Соцсети", slug: "social" },
  { label: "Артефакты", slug: "marquee" },
  { label: "Переключатель волн", slug: "waveSwitcher" },
  { label: "Свежесть данных", slug: "freshness" },
];

test.beforeEach(async ({ page }) => {
  // Freeze the clock BEFORE navigating (mskToday() and "N ago" both read Date).
  await page.clock.install({ time: FIXED_TIME });
  await stubApi(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // The font gate (DESIGN §7.10): the board is hidden until the wave's fonts arrive. Without this
  // wait a snapshot catches an empty space, or races the change of typeface.
  await page.waitForFunction(() => document.documentElement.dataset.fonts !== "pending");
});

test("per-tile visual regression", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const tiles = isMobile ? MOBILE : DESKTOP;
  // The board renders both layouts and switches visibility by media query, so scope to the
  // visible container or we catch the hidden duplicate of the tile.
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');

  for (const t of tiles) {
    const tile = container.locator(`section[aria-label="${t.label}"]`).first();
    await expect.soft(tile, `tile «${t.label}» виден`).toBeVisible();
    await expect.soft(tile).toHaveScreenshot(`${t.slug}.png`);
  }
});

/**
 * The "Today" tile has two bodies (§4.1/§4.2) and they are fundamentally different pictures:
 * a weekday quest map with stops, streaks and the monster's verdict, and the weekend rest scene.
 * A weekday is reached by clicking the calendar — the board IS navigation across days.
 */

/**
 * `todayLongTitle.png` is a third baseline: a weekday with a 75-character day name from
 * production, which wraps onto a second line and keeps its size instead of shrinking to
 * unreadable. Other names never show the wrap.
 */
test("плитка «Сегодня»: будни (карта-тропа) и выходной (сцена отдыха)", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const tile = container.locator(`section[aria-label="${TODAY_TILE}"]`).first();

  // 2026-06-18 is a Thursday: the quest map. Wait for the map itself rather than a timeout — the
  // click repaints the tile's body, and a snapshot before that catches the weekend scene.
  await container.locator('[data-testid="day-2026-06-18"]').first().click();
  await expect(tile.locator('[data-testid="quest-map"]')).toBeVisible();
  await expect.soft(tile).toHaveScreenshot("today.png");

  await container.locator('[data-testid="day-2026-06-21"]').first().click();
  await expect(tile.locator('[data-testid="weekend-scene"]')).toBeVisible();
  await expect.soft(tile).toHaveScreenshot("todayWeekend.png");

  // 2026-06-17 is a Wednesday with a long day name: a two-line header, the quest map below.
  await container.locator('[data-testid="day-2026-06-17"]').first().click();
  await expect(tile.locator('[data-testid="quest-map"]')).toBeVisible();
  await expect(tile.getByTestId("today-title")).toContainText("тройной пресс");
  await expect.soft(tile).toHaveScreenshot("todayLongTitle.png");
});

/**
 * The GitHub contributions chip (PRD §5.15) is checked through the DOM, not pixels: two digits at
 * a small size do not reach the tile baseline's `maxDiffPixelRatio`, so visual regression would
 * not notice it disappearing.
 */
test("чип вкладов GitHub доезжает до борда", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const stats = container.locator('section[aria-label="Статы — активность"]').first();

  await expect(stats.getByTestId("stats-contributions")).toHaveText("+7");
});
