import { test, expect } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * Пер-тайл визуальная регрессия (PRD §12 M5). Снимаем каждую плитку по её `aria-label`
 * (а не борд целиком) — так диффы локальны и не шумят на соседях. Состав плиток разный по
 * вьюпортам: desktop — полный bento, mobile — `MOBILE_ORDER` (календарь → недельная полоса).
 * Один проход на проект с soft-ассертами: одна разошедшаяся плитка не прячет остальные.
 */

interface Tile {
  label: string;
  slug: string;
}

/** Десктоп: полный bento (см. layout.ts TILE_LAYOUT). */
const DESKTOP: Tile[] = [
  { label: "Сегодня", slug: "today" },
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

/** Мобайл: стек MOBILE_ORDER (календарь — недельной полосой). */
const MOBILE: Tile[] = [
  { label: "Сегодня", slug: "today" },
  { label: "Календарь (полоса)", slug: "calendar" },
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
  // Фиксируем часы ДО навигации (mskToday()/«N назад» завязаны на Date).
  await page.clock.install({ time: FIXED_TIME });
  await stubApi(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("per-tile visual regression", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const tiles = isMobile ? MOBILE : DESKTOP;
  // Борд рендерит обе раскладки (bento + stack), переключая видимость по медиа-запросу —
  // скоупим в видимый контейнер, иначе словим скрытый дубль тайла.
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');

  for (const t of tiles) {
    const tile = container.locator(`section[aria-label="${t.label}"]`).first();
    await expect.soft(tile, `tile «${t.label}» виден`).toBeVisible();
    await expect.soft(tile).toHaveScreenshot(`${t.slug}.png`);
  }
});

/**
 * Чип вкладов GitHub (PRD §5.15) — **проверкой DOM, а не пикселями**: две цифры мелким кеглем
 * не добирают допуск `maxDiffPixelRatio` эталона плитки, то есть визуальная регрессия его
 * пропажу не заметит. Дублировать юнит-тесты незачем — здесь важно, что цифра доезжает
 * до собранного борда через реальную цепочку `days?from=&to=` → плитка статов.
 */
test("чип вкладов GitHub доезжает до борда", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const stats = container.locator('section[aria-label="Статы — активность"]').first();

  await expect(stats.getByTestId("stats-contributions")).toHaveText("+7");
});
