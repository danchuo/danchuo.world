import { defineConfig } from "@playwright/test";

/**
 * Визуальная регрессия пер-тайл (PRD §12 M5) — закрепляет вёрстку плиток (вкл. музыкальную)
 * перед релизом, то, что jsdom-юниты не ловят. Два вьюпорта: desktop (Full HD) и mobile
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
  /**
   * `reducedMotion` — не косметика прогона, а условие детерминизма. Лента артефактов (§7.2)
   * едет покадрово из JS, и `animations: "disabled"` её не останавливает: это флаг для
   * CSS-анимаций. В режиме «меньше движения» лента стоит на своём нулевом смещении — том же,
   * в котором её ловил прежний снимок с CSS-анимацией, — и эталон снова воспроизводим.
   */
  use: { baseURL: BASE_URL, contextOptions: { reducedMotion: "reduce" } },
  expect: {
    // Небольшой допуск на субпиксельный антиалиасинг; крупная регрессия вёрстки всё равно ловится.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  projects: [
    // Full HD — самый ходовой десктоп; эталоны должны представлять типичного посетителя, а не
    // конкретную машину. NB: это НЕ опора пропорций §8.1 — та считается от 1536 (экран владельца,
    // где размеры утверждались) и остаётся 1536; здесь только вьюпорт прогона.
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    // hasTouch — не косметика: режим борда и тач-таргеты ≥44px решает `pointer: coarse`
    // (DESIGN §8/§9). Без эмуляции тача мобильный проект отвечал `pointer: fine` и попадал
    // в стек лишь по страховочному порогу ширины, то есть проверял не тот путь.
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});
