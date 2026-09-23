import { test, expect } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * Per-tile visual regression (PRD §12) of the DEFAULT wave (DESIGN §10.2): no wave cookie is set,
 * so the lists below follow that wave's board. Each tile is shot by its `aria-label`; soft asserts
 * keep one diverged tile from hiding the others.
 */

interface Tile {
  label: string;
  slug: string;
}

/** The "Today" tile is shot by a SEPARATE test below, on chosen days rather than the frozen now. */
const TODAY_TILE = "Сегодня";

/** Desktop: the default wave's bento (`resolveLayout`); the two social marks share one label. */
const DESKTOP: Tile[] = [
  { label: "Последний фото-дроп", slug: "latestDrop" },
  { label: "Музыка", slug: "music" },
  { label: "Артефакты", slug: "marquee" },
  { label: "Сон", slug: "sleep" },
  { label: "Фото-дропы", slug: "photoDrops" },
  { label: "Статы — активность", slug: "stats" },
  { label: "Календарь", slug: "calendar" },
  { label: "Соцсети", slug: "social" },
  { label: "Проекты", slug: "projects" },
  { label: "Написать автору", slug: "feedback" },
  { label: "Переключатель волн", slug: "waveSwitcher" },
];

/** Mobile: the default wave's stack order, then the default tail. */
const MOBILE: Tile[] = [
  { label: "Календарь", slug: "calendar" },
  { label: "Сон", slug: "sleep" },
  { label: "Музыка", slug: "music" },
  { label: "Статы — активность", slug: "stats" },
  { label: "Последний фото-дроп", slug: "latestDrop" },
  { label: "Фото-дропы", slug: "photoDrops" },
  { label: "Соцсети", slug: "social" },
  { label: "Проекты", slug: "projects" },
  { label: "Артефакты", slug: "marquee" },
  { label: "Переключатель волн", slug: "waveSwitcher" },
  { label: "Написать автору", slug: "feedback" },
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
 * "Today" on a plain weekday and on a day with a 75-character name from production: the name is
 * set to fit one line, so its size is data and only a long name shows the floor (DESIGN §4.3).
 * A day is reached by clicking the calendar — the board IS navigation across days.
 */
test("the \"Today\" tile: a weekday and a long day name", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const tile = container.locator(`section[aria-label="${TODAY_TILE}"]`).first();

  // Wait for the day's own stamp rather than a timeout: the click repaints the tile's body.
  await container.locator('[data-testid="day-2026-06-18"]').first().click();
  await expect(tile.locator(".today-sheet__stamp")).toContainText("18");
  await expect.soft(tile).toHaveScreenshot("today.png");

  await container.locator('[data-testid="day-2026-06-17"]').first().click();
  await expect(tile.locator(".today-sheet__voice")).toContainText("тройной пресс");
  await expect.soft(tile).toHaveScreenshot("todayLongTitle.png");
});

/**
 * GitHub contributions (PRD §5.15) are checked through the DOM, not pixels: two digits at a small
 * size do not reach the tile baseline's `maxDiffPixelRatio`.
 */
test("GitHub contributions reach the stats tile", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const stats = container.locator('section[aria-label="Статы — активность"]').first();

  await stats.getByRole("button", { name: "метрика: git" }).click();
  await expect(stats.locator(".stats-ghosts__figure")).toHaveText("+7");
});
