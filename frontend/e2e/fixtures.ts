import type { Page } from "@playwright/test";

/**
 * Детерминизм визуальной регрессии (PRD §12 M5). Борд тянет данные на клиенте из живого
 * бэка (даты «сегодня», Spotify, свежесть — плавают), поэтому для стабильных эталонов мы
 * 1) фиксируем часы ([FIXED_TIME]) и 2) подменяем все клиентские `/api/*` фикстурами ниже
 * ([stubApi]). SSR-инжект токенов темы идёт серверным fetch (его page.route не перехватит) —
 * он читает реальную БД, что детерминировано (тема стабильна). Картинки в фикстурах — `null`:
 * тайлы рисуют плейсхолдеры, без внешних загрузок (иначе эталон зависел бы от сети.)
 */

/** Зафиксированное «сейчас»: 12:00 MSK 21.06.2026 ⇒ mskToday()=2026-06-21. */
export const FIXED_TIME = new Date("2026-06-21T09:00:00Z");

/** Канон-дата выбранного дня (совпадает с FIXED_TIME в MSK). */
const TODAY = "2026-06-21";

const DISCIPLINE = [
  { key: "stretch", label: "Растяжка", icon: null, count: 1, target: 1 },
  { key: "reading", label: "Чтение", icon: null, count: 1, target: 2 },
  { key: "podcasts", label: "Английские подкасты", icon: null, count: 2, target: 2 },
  { key: "diary", label: "Дневник перед сном", icon: null, count: 0, target: 1 },
  { key: "office", label: "Офис по расписанию", icon: null, count: 1, target: 1 },
  { key: "monster", label: "Монстр", icon: null, count: 1, target: 1 },
];

const DAY_VIEW = {
  date: TODAY,
  title: "первый забег",
  hasData: true,
  health: { steps: 8421, sleepMinutes: 437, sleepStages: null },
  workouts: [{ type: "Бег", durationMinutes: 32, activeEnergyKcal: 290, distanceMeters: 5200 }],
  discipline: DISCIPLINE,
  monster: { key: "ultra", name: "Ultra Paradise", imageUrl: null, accentColor: "#6ec1e4" },
};

/** Детерминированные сводки для диапазона [from,to] — заполняют сетку календаря без сети. */
function summaries(from: string, to: string) {
  const out: unknown[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let i = 0;
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const has = iso <= TODAY; // будущие дни — пустые (PRD §4)
    out.push({
      date: iso,
      title: iso === TODAY ? "первый забег" : null,
      hasData: has,
      steps: has ? 5000 + ((i * 311) % 6000) : null,
      sleepMinutes: has ? 400 + ((i * 17) % 80) : null,
      disciplineDone: has ? (i % 6) : 0,
      disciplineTotal: 6,
      monster: has && i % 3 === 0 ? { key: "ultra", name: "Ultra", accentColor: "#6ec1e4" } : null,
    });
    d.setUTCDate(d.getUTCDate() + 1);
    i++;
  }
  return out;
}

const NOW_PLAYING = {
  isPlaying: true,
  progressMs: 72000,
  track: {
    title: "Midnight City",
    artists: [{ name: "M83", url: null }],
    album: { name: "Hurry Up, We're Dreaming", url: null },
    albumImageUrl: null,
    url: null,
    durationMs: 244000,
  },
  source: { type: "playlist", url: "https://open.spotify.com", name: "ночная смена" },
};

const RECENT = [
  { track: { title: "Outro", artists: [{ name: "M83", url: null }], album: null, albumImageUrl: null, url: null, durationMs: null }, playedAt: "2026-06-21T08:30:00Z" },
  { track: { title: "Reunion", artists: [{ name: "M83", url: null }], album: null, albumImageUrl: null, url: null, durationMs: null }, playedAt: "2026-06-21T08:10:00Z" },
];

const PROJECTS = [
  { iconUrl: null, title: "danchuo.world", description: null, startYear: 2026, startQuarter: 1, endYear: null, endQuarter: null, url: "https://github.com/dontyouo" },
];

const SOCIAL = [
  { platform: "github", name: "GitHub", url: "https://github.com", icon: null },
  { platform: "telegram", name: "Telegram", url: "https://t.me", icon: null },
];

const ARTIFACTS = [
  { name: "Камера", imageUrl: null, firstMentionedOn: "2026-01-15" },
  { name: "Ракетка", imageUrl: null, firstMentionedOn: "2026-02-20" },
  { name: "Очки", imageUrl: null, firstMentionedOn: "2026-03-10" },
];

const DROPS = [
  { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: null },
];

const FRESHNESS = { lastIngestAt: "2026-06-21T06:00:00Z" }; // 6 ч назад от FIXED_TIME

/** Подменяет все клиентские `/api/*` детерминированными фикстурами. */
export async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.startsWith("/api/days/")) return json(DAY_VIEW);
    if (path === "/api/days") return json(summaries(url.searchParams.get("from") ?? TODAY, url.searchParams.get("to") ?? TODAY));
    if (path === "/api/spotify/now-playing") return json(NOW_PLAYING);
    if (path === "/api/spotify/recent") return json(RECENT);
    if (path === "/api/projects") return json(PROJECTS);
    if (path === "/api/social-links") return json(SOCIAL);
    if (path === "/api/artifacts") return json(ARTIFACTS);
    if (path === "/api/drops") return json(DROPS);
    if (path === "/api/freshness") return json(FRESHNESS);
    if (path === "/api/theme/active" || path === "/api/themes") return route.continue(); // тема — из реальной БД (детерминирована)
    return json({});
  });
}
