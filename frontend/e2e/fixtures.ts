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
  { key: "stretch", label: "Растяжка", icon: null, count: 1, target: 1, occurrenceStreaks: [12] },
  { key: "reading", label: "Чтение", icon: null, count: 1, target: 2, occurrenceStreaks: [5, 3] },
  { key: "podcasts", label: "Английские подкасты", icon: null, count: 2, target: 2, occurrenceStreaks: [8, 6] },
  { key: "diary", label: "Дневник перед сном", icon: null, count: 0, target: 1, occurrenceStreaks: [1] },
  { key: "office", label: "Офис по расписанию", icon: null, count: 1, target: 1, occurrenceStreaks: [4] },
  { key: "monster", label: "Монстр", icon: null, count: 1, target: 1, occurrenceStreaks: [0] },
];

const DAY_VIEW = {
  date: TODAY,
  title: "первый забег",
  hasData: true,
  health: { steps: 8421, sleepMinutes: 437, sleepStages: null },
  workouts: [{ type: "Бег", durationMinutes: 32, activeEnergyKcal: 290, distanceMeters: 5200 }],
  discipline: DISCIPLINE,
  monster: { key: "ultra", name: "Ultra Paradise", imageUrl: null, accentColor: "#6ec1e4" },
  // Монстр выпит сегодня, но «чисто» держит вчерашнюю серию (правило «сегодня не роняет», §5.6).
  monsterCleanStreak: 5,
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
      // Вклады GitHub (§5.15): чип «+N» в статах. Каждый четвёртый день — измеренный ноль
      // (чип на нём молчит), у «сегодня» значение заведомо ненулевое — иначе эталон не
      // закреплял бы сам чип.
      contributions: has ? (iso === TODAY ? 7 : i % 4 === 0 ? 0 : 1 + ((i * 5) % 12)) : null,
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

// Порядок = порядок API: идущие «по настоящее» сверху, завершённые ниже (PRD §5.7).
// Спрайты-планетки — реальная статика /assets/projects/ (детерминирована, не стабится).
const PROJECTS = [
  { iconUrl: "/assets/projects/danchuo-world-px.png", title: "danchuo.world", description: null, startYear: 2026, startQuarter: 3, endYear: 2026, endQuarter: 3, url: "https://danchuo.world" },
  { iconUrl: "/assets/projects/proxemics.png", title: "proxemics", description: null, startYear: 2026, startQuarter: 2, endYear: 2026, endQuarter: 2, url: "https://github.com/danchuo/proxemics" },
];

const SOCIAL = [
  { platform: "github", name: "GitHub", url: "https://github.com/danchuo", icon: "/assets/social/github.svg" },
  { platform: "telegram", name: "Telegram", url: "https://t.me/danchuo", icon: "/assets/social/telegram.svg" },
  { platform: "x", name: "X", url: "https://x.com/danchuo", icon: "/assets/social/x.svg" },
  { platform: "instagram", name: "Instagram", url: "https://instagram.com/danchuo_", icon: "/assets/social/instagram.svg" },
];

// Реальный артефакт — статика фронта /assets/artifacts/ (детерминирована, локальная, не стабится).
const ARTIFACTS = [
  { name: "Cyber Y2K Sunglasses", imageUrl: "/assets/artifacts/cyber-y2k-sunglasses.png", firstMentionedOn: "2026-07-22" },
];

const DROPS = [
  { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 8, coverPhotoUrl: "/api/film-media/1/0/thumb" },
];

/** Кадры последнего дропа для тайла/модалки. Картинки стаб-1×1 — снимок детерминирован
 *  независимо от того, какие 5 «случайных» кадров выбрал тайл (все варианты пиксельно равны). */
const DROP_PHOTOS = Array.from({ length: 8 }, (_, i) => ({
  imageUrl: `/api/film-media/1/${i}/web`,
  thumbUrl: `/api/film-media/1/${i}/thumb`,
  width: 120,
  height: 80,
}));

/** 1×1 PNG — стаб для всех media-запросов кадров (без сети, без битых картинок в эталоне). */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const FRESHNESS = { lastIngestAt: "2026-06-21T06:00:00Z" }; // 6 ч назад от FIXED_TIME

/** Поездки Велобайк. Координаты `null` — карта (внешние тайлы CARTO) НЕ рисуется ⇒ эталон
 *  не зависит от сети/рендера Leaflet; снимаем верстку тайла (цифры/«когда»/«предыдущие»). */
const RIDES = [
  { id: 2, rideDate: "2026-06-18", startTime: "2026-06-18T09:00:00Z", finishTime: "2026-06-18T09:30:00Z", distanceMeters: 5000, durationSeconds: 1800, calories: 120, vehicleType: "OMNI_24", tariffName: "Пакет 60 минут", startLat: null, startLon: null, finishLat: null, finishLon: null, startAddress: null, finishAddress: null },
  { id: 1, rideDate: "2026-06-10", startTime: "2026-06-10T10:00:00Z", finishTime: "2026-06-10T10:20:00Z", distanceMeters: 3000, durationSeconds: 1200, calories: 60, vehicleType: "OMNI_24", tariffName: "Поминутный", startLat: null, startLon: null, finishLat: null, finishLon: null, startAddress: null, finishAddress: null },
];
const RIDE_STATS = { totalRides: 2, totalDistanceMeters: 8000, totalDurationSeconds: 3000, totalCalories: 180, longestRideMeters: 5000, firstRideDate: "2026-06-10", lastRideDate: "2026-06-18" };

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
    if (path.startsWith("/api/film-media")) return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
    if (path === "/api/drops") return json(DROPS);
    if (path.startsWith("/api/drops/")) return json(DROP_PHOTOS);
    if (path === "/api/freshness") return json(FRESHNESS);
    if (path === "/api/rides") return json(RIDES);
    if (path === "/api/rides/stats") return json(RIDE_STATS);
    if (path === "/api/theme/active" || path === "/api/themes") return route.continue(); // тема — из реальной БД (детерминирована)
    return json({});
  });
}
