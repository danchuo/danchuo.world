import { test, expect } from "@playwright/test";
import { FIXED_TIME, stubApi } from "./fixtures";

/**
 * Пер-тайл визуальная регрессия (PRD §12 M5). Снимаем каждую плитку по её `aria-label`
 * (а не борд целиком) — так диффы локальны и не шумят на соседях. Состав плиток разный по
 * вьюпортам: desktop — полный bento, mobile — `MOBILE_ORDER` (тот же календарь-сетка).
 * Один проход на проект с soft-ассертами: одна разошедшаяся плитка не прячет остальные.
 */

interface Tile {
  label: string;
  slug: string;
}

/**
 * Плитку «Сегодня» снимает ОТДЕЛЬНЫЙ тест (ниже), а не общий цикл: зафиксированное «сейчас»
 * фикстур — воскресенье, и в общем проходе эталон захватывал бы сцену выходного, оставляя
 * карту-тропу — доминанту борда и его самый живой элемент — вообще без визуальной регрессии.
 * Отдельный тест кликает будний день и снимает ОБА состояния.
 */
const TODAY_TILE = "Сегодня";

/** Десктоп: полный bento (см. layout.ts TILE_LAYOUT). */
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

/** Мобайл: стек MOBILE_ORDER (календарь — та же сетка недель, что в бенто). */
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
 * Плитка «Сегодня» — оба тела (§4.1/§4.2), потому что они принципиально разные картинки.
 *
 * `today.png` — **будний день**: карта-тропа с остановками, стриками и вердиктом монстра.
 * Это основной вид плитки (5 дней из 7) и самая живая часть борда, но общий цикл снимал её
 * никогда: зафиксированное «сейчас» фикстур — воскресенье 2026-06-21, то есть в эталон
 * попадала сцена отдыха. Будний день выбираем кликом по календарю — борд это и есть
 * навигация по дням, отдельного шва для «покажи другой день» не нужно.
 *
 * `todayWeekend.png` — воскресенье (дефолт фикстур): сцена отдыха со строкой монстра.
 */
test("плитка «Сегодня»: будни (карта-тропа) и выходной (сцена отдыха)", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  const container = page.locator(isMobile ? '[data-testid="stack"]' : '[data-testid="bento"]');
  const tile = container.locator(`section[aria-label="${TODAY_TILE}"]`).first();

  // 2026-06-18 — четверг: карта-тропа. Ждём саму карту, а не таймаут: клик перерисовывает
  // тело плитки, и снимок до перерисовки поймал бы ещё сцену выходного.
  await container.locator('[data-testid="day-2026-06-18"]').first().click();
  await expect(tile.locator('[data-testid="quest-map"]')).toBeVisible();
  await expect.soft(tile).toHaveScreenshot("today.png");

  // Назад на воскресенье — сцена отдыха.
  await container.locator('[data-testid="day-2026-06-21"]').first().click();
  await expect(tile.locator('[data-testid="weekend-scene"]')).toBeVisible();
  await expect.soft(tile).toHaveScreenshot("todayWeekend.png");
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
