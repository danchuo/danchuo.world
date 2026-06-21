import { defineConfig } from "@playwright/test";

/**
 * Визуальная регрессия пер-тайл (PRD §12 M5) — закрепляет вёрстку плиток (вкл. музыкальную)
 * перед релизом, то, что jsdom-юниты не ловят. Два вьюпорта: desktop (bento 16") и mobile
 * (стек). Эталоны снимаются в Docker (стабильный рендер шрифтов для CI) — см. e2e/README.md
 * и `npm run e2e:docker:update`. Детерминизм данных/времени — в e2e/fixtures.ts.
 *
 * baseURL берётся из PW_BASE_URL: локально http://localhost:3000, в Docker — host сайта.
 */
const BASE_URL = process.env.PW_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Эталоны кладём по проекту: e2e/__screenshots__/<desktop|mobile>/<tile>.png
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: BASE_URL },
  expect: {
    // Небольшой допуск на субпиксельный антиалиасинг; крупная регрессия вёрстки всё равно ловится.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1512, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
});
