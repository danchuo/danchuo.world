import type { Page } from "@playwright/test";

/**
 * Determinism for visual regression (PRD §12). The board pulls data on the client from a live
 * backend (today's date, Spotify, freshness all drift), so for stable baselines the clock is frozen
 * ([FIXED_TIME]) and every client `/api/*` call is replaced by the fixtures below ([stubApi]).
 */

/**
 * The SSR inject of theme tokens goes through a server fetch that `page.route` cannot intercept; it
 * reads the real database, which is deterministic because the theme is stable. Pictures in the
 * fixtures are `null`, so tiles draw placeholders and nothing is fetched from the network.
 */

/** The frozen "now": 12:00 MSK on 2026-06-21, so `mskToday()` is 2026-06-21. */
export const FIXED_TIME = new Date("2026-06-21T09:00:00Z");

/** Canonical date of the selected day (matching FIXED_TIME in MSK). */
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
  // The monster was drunk today, but "clean" keeps yesterday's run (PRD §5.6: today does not drop it).
  monsterDrunk: true,
  monsterCleanStreak: 5,
};

/**
 * A day with a LONG name, on its own fixture date: the day's name wraps onto a second line, and this
 * is the only tile view where wrapping shows. The string is a real day name from production, 75
 * characters — the one on which the owner noticed that squeezing it into one line made it unreadable.
 */
const LONG_TITLE_DATE = "2026-06-17";
const LONG_TITLE = "тройной пресс на работе еще и люстру не починили а она и не ломалась кстати";

/** Deterministic summaries for the range [from, to], filling the calendar grid without a network. */
function summaries(from: string, to: string) {
  const out: unknown[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let i = 0;
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const has = iso <= TODAY; // future days are empty (PRD §4)
    out.push({
      date: iso,
      title: iso === TODAY ? "первый забег" : iso === LONG_TITLE_DATE ? LONG_TITLE : null,
      hasData: has,
      steps: has ? 5000 + ((i * 311) % 6000) : null,
      sleepMinutes: has ? 400 + ((i * 17) % 80) : null,
      // GitHub contributions (PRD §5.15): the "+N" chip in the stats. Every fourth day is a measured
      // zero, where the chip stays silent, and "today" is deliberately non-zero — otherwise the
      // baseline would not pin the chip itself.
      contributions: has ? (iso === TODAY ? 7 : i % 4 === 0 ? 0 : 1 + ((i * 5) % 12)) : null,
      // The monster was marked on every day with a record (the shortcut ran), PRD §5.6; drunk on every third.
      monsterDrunk: has ? i % 3 === 0 : null,
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

// Order = the API's order: ongoing projects on top, finished ones below (PRD §5.7). The planet
// sprites are real frontend statics, deterministic and not stubbed.

// ⚠️ `modelUrl` is deliberately empty although the live board gives danchuo.world a 3D planet
// (DESIGN §12.5): a WebGL frame depends on the driver and antialiasing, so a pixel comparison
// would diverge on any other machine. The 3D presentation is held by the `Artifact3D` unit tests.
const PROJECTS = [
  { iconUrl: "/assets/projects/danchuo-world-px.png", modelUrl: null, title: "danchuo.world", description: null, startYear: 2026, startQuarter: 3, endYear: 2026, endQuarter: 3, url: "https://danchuo.world" },
  { iconUrl: "/assets/projects/proxemics.png", modelUrl: null, title: "proxemics", description: null, startYear: 2026, startQuarter: 2, endYear: 2026, endQuarter: 2, url: "https://github.com/danchuo/proxemics" },
];

const SOCIAL = [
  { platform: "github", name: "GitHub", url: "https://github.com/danchuo", icon: "/assets/social/github.svg" },
  { platform: "telegram", name: "Telegram", url: "https://t.me/danchuo", icon: "/assets/social/telegram.svg" },
  { platform: "x", name: "X", url: "https://x.com/danchuo", icon: "/assets/social/x.svg" },
  { platform: "instagram", name: "Instagram", url: "https://instagram.com/danchuo_", icon: "/assets/social/instagram.svg" },
];

// A real artifact from the frontend statics — deterministic, local and not stubbed.
const ARTIFACTS = [
  { name: "Cyber Y2K Sunglasses", imageUrl: "/assets/artifacts/cyber-y2k-sunglasses.png", firstMentionedOn: "2026-07-22" },
];

const DROPS = [
  { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 8, coverPhotoUrl: "/api/film-media/1/0/thumb" },
];

/** Frames of the latest drop, for the tile and the modal. The pictures are 1×1 stubs, so the snapshot
 *  is deterministic whichever five "random" frames the tile picked — every variant is pixel-equal. */
const DROP_PHOTOS = Array.from({ length: 8 }, (_, i) => ({
  imageUrl: `/api/film-media/1/${i}/web`,
  thumbUrl: `/api/film-media/1/${i}/thumb`,
  width: 120,
  height: 80,
}));

/** A 1×1 PNG, the stub for every frame media request: no network, no broken pictures in a baseline. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const FRESHNESS = { lastIngestAt: "2026-06-21T06:00:00Z" }; // 6 h before FIXED_TIME

/** Velobike rides. Coordinates are `null`, so the map (external CARTO tiles) is NOT drawn and the
 *  baseline does not depend on the network or on Leaflet's rendering — only the tile's layout. */
const RIDES = [
  { id: 2, rideDate: "2026-06-18", startTime: "2026-06-18T09:00:00Z", finishTime: "2026-06-18T09:30:00Z", distanceMeters: 5000, durationSeconds: 1800, calories: 120, vehicleType: "OMNI_24", tariffName: "Пакет 60 минут", startLat: null, startLon: null, finishLat: null, finishLon: null, startAddress: null, finishAddress: null },
  { id: 1, rideDate: "2026-06-10", startTime: "2026-06-10T10:00:00Z", finishTime: "2026-06-10T10:20:00Z", distanceMeters: 3000, durationSeconds: 1200, calories: 60, vehicleType: "OMNI_24", tariffName: "Поминутный", startLat: null, startLon: null, finishLat: null, finishLon: null, startAddress: null, finishAddress: null },
];
/** A night for the sleep echo (DESIGN §7.7): minutes from the 18:00 axis start. */
const NIGHT_PARTS = [
  { stage: "awake", fromMinute: 300, toMinute: 323 },
  { stage: "light", fromMinute: 323, toMinute: 440 },
  { stage: "deep", fromMinute: 440, toMinute: 520 },
  { stage: "rem", fromMinute: 520, toMinute: 620 },
  { stage: "light", fromMinute: 620, toMinute: 748 },
];
const RIDE_STATS = { totalRides: 2, totalDistanceMeters: 8000, totalDurationSeconds: 3000, totalCalories: 180, longestRideMeters: 5000, firstRideDate: "2026-06-10", lastRideDate: "2026-06-18" };

/** Replaces every client `/api/*` call with deterministic fixtures. */
export async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    // The day projection is served FOR THE REQUESTED date rather than always for "today": the board
    // is navigation across days, and with a constant date every calendar click would return the same
    // projection, leaving the tile on one day whatever was asked of it.
    if (path.startsWith("/api/days/")) {
      const date = path.slice("/api/days/".length);
      return json({ ...DAY_VIEW, date, title: date === LONG_TITLE_DATE ? LONG_TITLE : DAY_VIEW.title });
    }
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
    if (path.startsWith("/api/sleep/night/")) {
      const date = path.slice("/api/sleep/night/".length);
      return json({ date, axisStartHour: 18, band: { onsetMinute: 300, wakeMinute: 748, asleepMinutes: 425, asleepFromMinute: 323, parts: NIGHT_PARTS } });
    }
    // Social previews are absent: a 204 is null to the client, an empty object would be a preview.
    if (path === "/api/instagram/latest" || path === "/api/telegram/profile") return route.fulfill({ status: 204 });
    return json({});
  });
}
