import { test, expect } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

const stages = { awake: 23, rem: 100, light: 245, deep: 80 };
const parts = [
  { stage: "awake", fromMinute: 300, toMinute: 323 },
  { stage: "light", fromMinute: 323, toMinute: 440 },
  { stage: "deep", fromMinute: 440, toMinute: 520 },
  { stage: "rem", fromMinute: 520, toMinute: 620 },
  { stage: "light", fromMinute: 620, toMinute: 748 },
];

test.beforeEach(async ({ page, context, baseURL }) => {
  page.on("pageerror", (error) => console.error(error.message));
  // The wave comes from a preference cookie (§5.9) whose domain must match the run's baseURL: in
  // Docker the board opens on host.docker.internal, a localhost cookie never arrives, and the page
  // silently renders the active wave instead. The `data-wave` assert below catches that.
  await context.addCookies([{ name: "danchuo_wave", value: "wave-03", url: baseURL! }]);
  await page.clock.setFixedTime(FIXED_TIME);
  await stubApi(page);
  // Wave 03 renders social previews; an absent preview is null, not an empty object.
  await page.route("**/api/instagram/latest", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/telegram/profile", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/days/*", async (route) => {
    const date = new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({ json: {
      date, title: null, hasData: true,
      health: { steps: 8000, sleepMinutes: 425, sleepStages: stages },
      workouts: [], discipline: [], monsterDrunk: null, monsterCleanStreak: 0,
    } });
  });
  await page.route("**/api/sleep/night/*", async (route) => {
    const date = new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({ json: {
      date, axisStartHour: 18,
      band: { onsetMinute: 300, wakeMinute: 748, asleepMinutes: 425, asleepFromMinute: 323, parts },
    } });
  });
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.dataset.fonts !== "pending");
  await expect(page.locator("html")).toHaveAttribute("data-wave", "wave-03");
});

test("sleep controls, label placement and keyboard round trip", async ({ page }, testInfo) => {
  const container = page.getByTestId(testInfo.project.name === "mobile" ? "stack" : "bento");
  const tile = container.locator('section[aria-label="Сон"]');
  const toggle = tile.getByRole("button", { name: "Ночь по часам" });
  const modes = tile.getByTestId("sleep-echo-modes");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // The label format is short: the full spelling left no gap between the row's end and the phase
  // name pinned to the edge (§7.7).
  await expect(tile.getByTestId("sleep-duration-light")).toHaveText("4ч 5м");
  await tile.scrollIntoViewIfNeeded();
  const bounds = await toggle.boundingBox();
  const corner = await modes.boundingBox();
  const head = await tile.locator(".sleep-echo__head").boundingBox();
  const total = await tile.locator(".sleep-echo__total").boundingBox();
  expect(bounds).not.toBeNull();
  // The pair of thumbnails sits in the BOTTOM right corner, in the flow of the strip at the right
  // end of the duration line — it takes room from the strip, not from the drawing.
  expect(corner!.x).toBeGreaterThan(bounds!.x + bounds!.width / 2);
  expect(corner!.y).toBeGreaterThan(bounds!.y + bounds!.height / 2);
  expect(corner!.x + corner!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(corner!.width).toBeGreaterThan(corner!.height);
  expect(corner!.y).toBeGreaterThanOrEqual(head!.y - 1);
  const chrome = await modes.evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(chrome).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)" });

  // The moon is the subject's sign at the head of the strip: this edition has no word for "sleep"
  // at all, and before the sign the strip began with a bare number.
  const moon = await tile.locator(".sleep-echo__moon").boundingBox();
  expect(moon!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(moon!.x + moon!.width).toBeLessThanOrEqual(total!.x);

  // A bar's paint must resolve inside ITS OWN layout: the board holds bento and stack in the DOM
  // at once, and a shared gradient id would point `url(#…)` at the hidden copy. The geometry stays
  // intact, so the box checks below cannot see that breakage (§7.7).
  const ownPaint = await tile.locator('[data-testid="sleep-echo-col"]').first().evaluate((el) => {
    const id = (el.getAttribute("fill") ?? "").replace(/^url\(#/, "").replace(/\)$/, "");
    return !!id && document.getElementById(id)?.closest("svg") === el.closest("svg");
  });
  expect(ownPaint).toBe(true);

  // The sum has no time axis, so there is nothing to name its ends with.
  await expect(tile.getByText("23:00")).toHaveCount(0);
  await expect(tile.getByText(/%/)).toHaveCount(0);

  for (const stage of Object.keys(stages)) {
    const label = tile.getByTestId(`sleep-duration-${stage}`);
    const name = tile.getByTestId(`sleep-name-${stage}`);
    await expect(label).toBeVisible();
    await expect(name).toBeVisible();
    const text = await label.boundingBox();
    const named = await name.boundingBox();
    // Phase names line up in a column at the right edge — that is what makes them a legend.
    expect(named!.x + named!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(Math.abs(named!.y - text!.y)).toBeLessThan(2);
    // The row growth ceiling (`--sleep-summary-limit`) must leave room for both the number and
    // the name: overlapping, neither can be read.
    expect(text!.x + text!.width).toBeLessThanOrEqual(named!.x);
    const bars = await tile.locator(`[data-testid="sleep-echo-col"][data-stage="${stage}"]`).evaluateAll((els) => {
      const rects = els.map((el) => el.getBoundingClientRect());
      return { right: Math.max(...rects.map((r) => r.right)), center: (rects[0].top + rects[0].bottom) / 2 };
    });
    expect(text!.x).toBeGreaterThan(bars.right);
    expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(Math.abs(text!.y + text!.height / 2 - bars.center)).toBeLessThan(2);
    // Row labels must end ABOVE the strip, which holds the night's duration and the thumbnails —
    // the deepest row passes closest to them.
    expect(text!.y + text!.height).toBeLessThanOrEqual(head!.y);
    expect(named!.y + named!.height).toBeLessThanOrEqual(head!.y);
  }
  await tile.screenshot({ path: testInfo.outputPath("sleep-summary.png") });
  await modes.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(tile.getByTestId("sleep-duration-light")).toBeHidden();
  await expect(tile.getByTestId("sleep-name-light")).toBeHidden();
  // The strip's second line is freed for the shares, its ends naming the night's start and end.
  // It must stay on ONE line: a wrap dropped the night's end under the legend, onto a different
  // level from its start.
  await expect(tile.getByText("CORE 58%")).toBeVisible();
  const legend = await tile.locator(".sleep-echo__phases").evaluate((el) => ({
    fits: el.scrollWidth <= el.clientWidth,
    levels: new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size,
    below: el.getBoundingClientRect().top,
  }));
  expect(legend.fits).toBe(true);
  expect(legend.levels).toBe(1);
  // In the chronology the strip rises to its second line, so the duration line is measured afresh:
  // in the sum it sat lower, at the very bottom of the tile.
  const headTimed = await tile.locator(".sleep-echo__head").boundingBox();
  expect(legend.below).toBeGreaterThanOrEqual(headTimed!.y + headTimed!.height - 1);
  const from = await tile.getByText("23:00").boundingBox();
  const to = await tile.getByText("06:28").boundingBox();
  expect(from!.x).toBeLessThan(to!.x);
  expect(Math.abs(from!.y - to!.y)).toBeLessThan(2);
  expect(to!.x + to!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  await tile.screenshot({ path: testInfo.outputPath("sleep-timeline.png") });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(tile.getByTestId("sleep-duration-light")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("long single-phase duration stays after its bar and inside the tile", async ({ page }, testInfo) => {
  await page.route("**/api/sleep/night/*", (route) => route.fulfill({ json: {
    date: "2026-06-21", axisStartHour: 18,
    band: { onsetMinute: 300, wakeMinute: 1017, asleepMinutes: 717, asleepFromMinute: 300,
      parts: [{ stage: "light", fromMinute: 300, toMinute: 1017 }] },
  } }));
  await page.reload();
  const container = page.getByTestId(testInfo.project.name === "mobile" ? "stack" : "bento");
  const tile = container.locator('section[aria-label="Сон"]');
  const label = tile.getByTestId("sleep-duration-light");
  await expect(label).toHaveText("11ч 57м");
  await tile.scrollIntoViewIfNeeded();
  const bounds = await tile.boundingBox();
  const text = await label.boundingBox();
  const named = await tile.getByTestId("sleep-name-light").boundingBox();
  const end = await tile.locator('[data-testid="sleep-echo-col"]').evaluateAll((els) =>
    Math.max(...els.map((el) => el.getBoundingClientRect().right)));
  expect(text!.x).toBeGreaterThan(end);
  // The growth ceiling's worst case: the longest number beside a name at the edge.
  expect(text!.x + text!.width).toBeLessThanOrEqual(named!.x);
  expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  await expect(tile.locator(".sleep-echo__duration")).toHaveCount(1);
  await tile.screenshot({ path: testInfo.outputPath("sleep-long-phase.png") });
});
