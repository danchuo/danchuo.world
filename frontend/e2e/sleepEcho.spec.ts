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
  // Волну выбирает cookie предпочтения (§5.9), и её домен обязан совпадать с baseURL прогона:
  // в Docker борд открывается по host.docker.internal, cookie для localhost туда не уедет —
  // страница молча отрендерится активной волной. Assert на `data-wave` ниже это и ловит.
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
  // Формат подписи короткий: между концом ряда и прижатым к краю именем фазы полная запись
  // не оставляла зазора (§7.7).
  await expect(tile.getByTestId("sleep-duration-light")).toHaveText("4ч 5м");
  await tile.scrollIntoViewIfNeeded();
  const bounds = await toggle.boundingBox();
  const corner = await modes.boundingBox();
  const head = await tile.locator(".sleep-echo__head").boundingBox();
  const total = await tile.locator(".sleep-echo__total").boundingBox();
  expect(bounds).not.toBeNull();
  // Пара миниатюр стоит в НИЖНЕМ правом углу и строкой: она лежит в потоке полосы, правым
  // концом строки с длительностью, — место отнимает у полосы, а не у рисунка.
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

  // Луна — знак предмета в начале полосы: слова «сон» у редакции нет вовсе, и до знака полоса
  // начиналась прямо с числа.
  const moon = await tile.locator(".sleep-echo__moon").boundingBox();
  expect(moon!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(moon!.x + moon!.width).toBeLessThanOrEqual(total!.x);

  // Краска бруска обязана резолвиться в СВОЮ раскладку: борд держит бенто и стек в DOM сразу,
  // и общий id градиента уводил бы `url(#…)` на скрытую копию, откуда браузер краску не берёт —
  // видимая плитка осталась бы с одними горизонтами (§7.7). Геометрия при этом цела, поэтому
  // проверки боксов ниже такую поломку не видят.
  const ownPaint = await tile.locator('[data-testid="sleep-echo-col"]').first().evaluate((el) => {
    const id = (el.getAttribute("fill") ?? "").replace(/^url\(#/, "").replace(/\)$/, "");
    return !!id && document.getElementById(id)?.closest("svg") === el.closest("svg");
  });
  expect(ownPaint).toBe(true);

  // Рамки ночи в сумме нет вовсе: оси времени у суммы нет, и называть её концы нечем.
  await expect(tile.getByText("23:00")).toHaveCount(0);
  await expect(tile.getByText(/%/)).toHaveCount(0);

  for (const stage of Object.keys(stages)) {
    const label = tile.getByTestId(`sleep-duration-${stage}`);
    const name = tile.getByTestId(`sleep-name-${stage}`);
    await expect(label).toBeVisible();
    await expect(name).toBeVisible();
    const text = await label.boundingBox();
    const named = await name.boundingBox();
    // Имена фаз выстроены в столбик у правого края — тем и работают легендой к рядам.
    expect(named!.x + named!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(Math.abs(named!.y - text!.y)).toBeLessThan(2);
    // Потолок роста рядов (`--sleep-summary-limit`) обязан оставлять место и числу, и имени:
    // наехав друг на друга, они оба перестают читаться.
    expect(text!.x + text!.width).toBeLessThanOrEqual(named!.x);
    const bars = await tile.locator(`[data-testid="sleep-echo-col"][data-stage="${stage}"]`).evaluateAll((els) => {
      const rects = els.map((el) => el.getBoundingClientRect());
      return { right: Math.max(...rects.map((r) => r.right)), center: (rects[0].top + rects[0].bottom) / 2 };
    });
    expect(text!.x).toBeGreaterThan(bars.right);
    expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(Math.abs(text!.y + text!.height / 2 - bars.center)).toBeLessThan(2);
    // Подписи рядов обязаны кончаться ВЫШЕ полосы: в ней стоят длительность ночи и пара
    // миниатюр, и самый глубокий ряд проходит к ним ближе всех.
    expect(text!.y + text!.height).toBeLessThanOrEqual(head!.y);
    expect(named!.y + named!.height).toBeLessThanOrEqual(head!.y);
  }
  await tile.screenshot({ path: testInfo.outputPath("sleep-summary.png") });
  await modes.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(tile.getByTestId("sleep-duration-light")).toBeHidden();
  await expect(tile.getByTestId("sleep-name-light")).toBeHidden();
  // Вторая строка полосы освободилась под доли, а её концы называют начало и конец ночи.
  // Строка обязана лежать в ОДНУ линию: перенос ронял конец ночи под легенду, то есть на
  // другой уровень, чем начало (за этим и убраны минуты пробуждений из легенды).
  await expect(tile.getByText("CORE 58%")).toBeVisible();
  const legend = await tile.locator(".sleep-echo__phases").evaluate((el) => ({
    fits: el.scrollWidth <= el.clientWidth,
    levels: new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size,
    below: el.getBoundingClientRect().top,
  }));
  expect(legend.fits).toBe(true);
  expect(legend.levels).toBe(1);
  // Полоса в хронологии поднимается на свою вторую строку, поэтому строка с длительностью
  // мерится заново: в сумме она стояла ниже — у самого низа плитки.
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
  // Худший случай потолка роста: самое длинное число при имени у края.
  expect(text!.x + text!.width).toBeLessThanOrEqual(named!.x);
  expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  await expect(tile.locator(".sleep-echo__duration")).toHaveCount(1);
  await tile.screenshot({ path: testInfo.outputPath("sleep-long-phase.png") });
});
