import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NowPlayingView, RecentTrackView, TrackView } from "@/lib/api/types";
import { MusicTile } from "./MusicTile";
import { collapseConsecutiveRecent } from "@/lib/recentTracks";

// Music fetches its own data — the JSON client is mocked.
vi.mock("@/lib/api/client", () => ({
  getNowPlaying: vi.fn(),
  getRecent: vi.fn(),
}));

import { getNowPlaying, getRecent } from "@/lib/api/client";

const getNowPlayingMock = vi.mocked(getNowPlaying);
const getRecentMock = vi.mocked(getRecent);

function track(over: Partial<TrackView> = {}): TrackView {
  return {
    title: "Strobe",
    artists: [{ name: "deadmau5", url: "https://open.spotify.com/artist/d" }],
    album: { name: "For Lack of a Better Name", url: "https://open.spotify.com/album/a" },
    albumImageUrl: "/cover.png",
    url: "https://open.spotify.com/track/x",
    durationMs: 634000,
    ...over,
  };
}

function nowView(over: Partial<NowPlayingView> = {}): NowPlayingView {
  return { isPlaying: true, progressMs: 0, track: track(), source: null, ...over };
}

function recentOf(over: Partial<TrackView>, playedAt: string): RecentTrackView {
  return { track: track(over), playedAt };
}

/** Five recent tracks — as many as the tile asks for when nothing is playing. */
function fiveRecent(): RecentTrackView[] {
  return ["A", "B", "C", "D", "E"].map((t, i) =>
    recentOf({ title: t, url: `u:${t}` }, `2026-06-18T10:0${5 - i}:00Z`),
  );
}

const restore: Array<() => void> = [];

/**
 * Geometry of the recent list: everything is zero in jsdom, and [useFitOverflow] decides by
 * exactly that. Setting the list and row heights here checks the rule itself rather than "nothing
 * is hidden in tests". Rows are flush, and the index comes from the position in the parent.
 */
function stubRowGeometry({
  listHeight,
  rowHeight,
  clipBottom,
}: {
  listHeight: number;
  rowHeight: number;
  /** The clipping ancestor's bottom (the tile's column): below it content is simply cut off. */
  clipBottom?: number;
}) {
  let h = rowHeight;
  if (clipBottom !== undefined) {
    const real = window.getComputedStyle;
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el: Element, pseudo?: string | null) =>
          el instanceof HTMLElement &&
        el.tagName !== "UL" &&
        el.className.includes("overflow-hidden")
          ? ({ overflowY: "hidden" } as CSSStyleDeclaration)
          : real(el, pseudo),
      );
    restore.push(() => spy.mockRestore());
  }
  const rect = (top: number, bottom: number) =>
    ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => "" }) as DOMRect;

  // Both geometries live on Element.prototype, not HTMLElement — otherwise the stub would miss
  // and the restore would fail on an undefined descriptor.
  const bcr = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect")!;
  const ch = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;
  restore.push(
    () => Object.defineProperty(Element.prototype, "getBoundingClientRect", bcr),
    () => Object.defineProperty(Element.prototype, "clientHeight", ch),
  );

  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element) {
      if (this.tagName === "LI" && this.parentElement?.tagName === "UL") {
        const i = Array.prototype.indexOf.call(this.parentElement.children, this);
        return rect(i * h, (i + 1) * h);
      }
      // The list is always its own height: it carries `overflow-hidden` too, and without this
      // check the pre-clip test "passed" because its own bottom had been stubbed.
      if (this.tagName === "UL") return rect(0, listHeight);
      if (clipBottom !== undefined && this instanceof HTMLElement && this.className.includes("overflow-hidden")) {
        return rect(0, clipBottom);
      }
      return rect(0, 0);
    },
  });
  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get(this: Element) {
      return this.tagName === "UL" ? listHeight : 0;
    },
  });

  return { setRowHeight: (next: number) => (h = next) };
}

afterEach(() => {
  vi.clearAllMocks();
  restore.splice(0).forEach((undo) => undo());
});

describe("collapseConsecutiveRecent", () => {
  it("схлопывает одинаковые треки, идущие подряд (по url)", () => {
    const list = [
      recentOf({ title: "A", url: "u:a" }, "2026-06-18T10:03:00Z"),
      recentOf({ title: "A", url: "u:a" }, "2026-06-18T10:02:00Z"),
      recentOf({ title: "B", url: "u:b" }, "2026-06-18T10:01:00Z"),
    ];
    expect(collapseConsecutiveRecent(list).map((r) => r.track.url)).toEqual(["u:a", "u:b"]);
  });

  it("не трогает одинаковые треки, разделённые другим (через один)", () => {
    const list = [
      recentOf({ title: "A", url: "u:a" }, "2026-06-18T10:03:00Z"),
      recentOf({ title: "B", url: "u:b" }, "2026-06-18T10:02:00Z"),
      recentOf({ title: "A", url: "u:a" }, "2026-06-18T10:01:00Z"),
    ];
    expect(collapseConsecutiveRecent(list).map((r) => r.track.url)).toEqual(["u:a", "u:b", "u:a"]);
  });

  it("схлопывает длинные серии, сохраняя первый элемент серии", () => {
    const list = [
      recentOf({ title: "A", url: "u:a" }, "t6"),
      recentOf({ title: "A", url: "u:a" }, "t5"),
      recentOf({ title: "A", url: "u:a" }, "t4"),
      recentOf({ title: "B", url: "u:b" }, "t3"),
      recentOf({ title: "B", url: "u:b" }, "t2"),
      recentOf({ title: "A", url: "u:a" }, "t1"),
    ];
    const out = collapseConsecutiveRecent(list);
    expect(out.map((r) => r.track.url)).toEqual(["u:a", "u:b", "u:a"]);
    // The first (freshest) item of the run is kept.
    expect(out[0].playedAt).toBe("t6");
  });

  it("различает треки по названию+артистам, когда url отсутствует", () => {
    const list = [
      recentOf({ title: "Same", url: null, artists: [{ name: "X", url: null }] }, "t3"),
      recentOf({ title: "Same", url: null, artists: [{ name: "Y", url: null }] }, "t2"),
      recentOf({ title: "Same", url: null, artists: [{ name: "Y", url: null }] }, "t1"),
    ];
    // The first two are different artists ⇒ kept; the last two are the same ⇒ collapsed.
    expect(collapseConsecutiveRecent(list).map((r) => r.track.artists[0]?.name)).toEqual(["X", "Y"]);
  });

  it("пустой список остаётся пустым", () => {
    expect(collapseConsecutiveRecent([])).toEqual([]);
  });
});

describe("MusicTile", () => {
  it("рендерит now-playing: трек, артиста и метку «сейчас играет»", async () => {
    const now = nowView({ progressMs: 1000 });
    getNowPlayingMock.mockResolvedValue(now);
    getRecentMock.mockResolvedValue([]);

    render(<MusicTile />);

    expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
    expect(screen.getByText("Strobe")).toBeInTheDocument();
    expect(screen.getByText("сейчас играет")).toBeInTheDocument();
    // Attribution links lead to Spotify, for the track and the artist alike.
    expect(screen.getByText("Strobe").closest("a")).toHaveAttribute("href", now.track!.url);
    expect(screen.getByText("deadmau5").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/d",
    );
    expect(screen.getByText("For Lack of a Better Name").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/album/a",
    );
  });

  it("ширина карточки НЕ анимируется — иначе WebKit размазывает её тень по боковым зазорам", async () => {
    // This hit hardest here: the width moves on EVERY track change. The card carries
    // filter: drop-shadow, WebKit does not clean the area freed by shrinking, and every frame of
    // the animation left a stripe of shadow (docs/pitfalls.md).
    getNowPlayingMock.mockResolvedValue(nowView({ progressMs: 1000 }));
    getRecentMock.mockResolvedValue([]);

    const { container } = render(<MusicTile />);
    await screen.findByTestId("now-playing");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.transition).toBe("");
  });

  it("источник (плейлист) показывается ссылкой с названием", async () => {
    getNowPlayingMock.mockResolvedValue(
      nowView({
        source: { type: "playlist", url: "https://open.spotify.com/playlist/p", name: "Ночной драйв" },
      }),
    );
    getRecentMock.mockResolvedValue([]);

    render(<MusicTile />);

    expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
    expect(screen.getByText("плейлист: Ночной драйв").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/playlist/p",
    );
  });

  it("при играющем треке недавние не показываются", async () => {
    getNowPlayingMock.mockResolvedValue(nowView());
    getRecentMock.mockResolvedValue([
      { track: track({ title: "Ghosts 'n' Stuff" }), playedAt: "2026-06-18T10:00:00Z" },
    ]);

    render(<MusicTile />);

    expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
    expect(screen.queryByTestId("recent-track")).not.toBeInTheDocument();
  });

  it("альбом-сингл/одноимённый не показывается (album=null)", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ track: track({ album: null }) }));
    getRecentMock.mockResolvedValue([]);

    render(<MusicTile />);

    expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
    expect(screen.queryByText("For Lack of a Better Name")).not.toBeInTheDocument();
  });

  it("ничего не играет и нет недавних → тихое пустое состояние", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue([]);

    render(<MusicTile />);

    expect(await screen.findByText("ничего не играет")).toBeInTheDocument();
    expect(screen.queryByTestId("now-playing")).not.toBeInTheDocument();
  });

  it("подряд идущие одинаковые недавние треки не дублируются", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue([
      { track: track({ title: "Strobe", url: "u:s" }), playedAt: "2026-06-18T10:03:00Z" },
      { track: track({ title: "Strobe", url: "u:s" }), playedAt: "2026-06-18T10:02:00Z" },
      { track: track({ title: "Ghosts", url: "u:g" }), playedAt: "2026-06-18T10:01:00Z" },
    ]);

    render(<MusicTile />);

    await waitFor(() => expect(screen.getAllByTestId("recent-track")).toHaveLength(2));
    expect(screen.getByText("Ghosts")).toBeInTheDocument();
  });

  it("без now-playing, но с недавними — показывает список недавних", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    const recent: RecentTrackView[] = [
      { track: track({ title: "Ghosts 'n' Stuff" }), playedAt: "2026-06-18T10:00:00Z" },
    ];
    getRecentMock.mockResolvedValue(recent);

    render(<MusicTile />);

    expect(await screen.findByTestId("recent-track")).toHaveTextContent("Ghosts 'n' Stuff");
  });

  it("ряд недавнего несёт давность прослушивания и альбом — по ним волна строит очередь", async () => {
    // The label is relative, so "now" is frozen in the test: otherwise it ages with the system clock.
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-06-18T10:14:00Z"));
    restore.push(() => vi.useRealTimers());

    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue([
      { track: track({ title: "Ghosts", album: { name: "Random Album Title", url: null } }), playedAt: "2026-06-18T10:00:00Z" },
    ]);

    render(<MusicTile />);

    const row = await vi.waitFor(() => screen.getByTestId("recent-track"));
    expect(row.querySelector(".recent-ago")).toHaveTextContent("14 мин");
    expect(row.querySelector(".recent-album")).toHaveTextContent("Random Album Title");
    // A row's cover is material for the wave: it is in the markup under any wave (the skin shows
    // or hides it), so what is checked is the picture's presence.
    expect(row.querySelector(".recent-cover img")).toHaveAttribute("src", "/cover.png");
  });

  it("без метки времени ряд рисуется без колонки давности, а не с пустой", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue([{ track: track({ title: "Ghosts" }), playedAt: null }]);

    render(<MusicTile />);

    const row = await screen.findByTestId("recent-track");
    expect(row.querySelector(".recent-ago")).toBeNull();
  });

  it("трек, не влезающий по высоте, гасится целиком — обрезанной строки не бывает", async () => {
    // The old trouble returning: the bottom track was "cut in half" by the widget's edge and half
    // a line of letters read as noise. Geometry is zero in jsdom, so we set it: a 100px list and
    // 30px rows ⇒ three fit (with FIT_MARGIN), the rest must be hidden.
    stubRowGeometry({ listHeight: 100, rowHeight: 30 });
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue(fiveRecent());

    render(<MusicTile />);

    const rows = await screen.findAllByTestId("recent-track");
    await waitFor(() => expect(rows[3].style.visibility).toBe("hidden"));
    expect(rows.slice(0, 3).map((r) => r.style.visibility)).toEqual(["", "", ""]);
    expect(rows[4].style.visibility).toBe("hidden");
  });

  it("список, смонтированный заново (трек доиграл, пока вкладка была в фоне), подгоняется заново", async () => {
    // The owner's complaint returning: after a long time away the fourth track is visible, clipped
    // by the tile's bottom. The list remounted with the SAME contents, and the fit, keyed on
    // contents, never re-ran — all five rows stayed visible and the edge cut the extras.
    stubRowGeometry({ listHeight: 100, rowHeight: 30 });
    getNowPlayingMock.mockResolvedValue(nowView());
    getRecentMock.mockResolvedValue(fiveRecent());
    const setVisibility = (value: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };

    try {
      render(<MusicTile />);
      expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
      expect(screen.queryAllByTestId("recent-track")).toHaveLength(0);

      // The tab went to the background, the track finished; returning brings "nothing is playing".
      getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
      await act(async () => setVisibility("hidden"));
      await act(async () => setVisibility("visible"));

      const rows = await screen.findAllByTestId("recent-track");
      expect(rows).toHaveLength(5);
      await waitFor(() => expect(rows[3].style.visibility).toBe("hidden"));
      expect(rows.slice(0, 3).map((r) => r.style.visibility)).toEqual(["", "", ""]);
      expect(rows[4].style.visibility).toBe("hidden");
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it("список, свисающий ниже края плитки, режется по КРАЮ ПЛИТКИ, а не по своему низу", async () => {
    // Measured on the live board: the tile's column ended at 119.6px while the list (its
    // min-height set for the mobile stack) hung to 150.3 — 30px below the visible edge. The fit
    // measured its own bottom, thought everything fitted, and the tile cut the bottom row.
    stubRowGeometry({ listHeight: 100, rowHeight: 20, clipBottom: 62 });
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue(fiveRecent());

    render(<MusicTile />);

    const rows = await screen.findAllByTestId("recent-track");
    // A clip at 62 ⇒ two rows fit with margin (40 ≤ 56), the third (60) does not.
    await waitFor(() => expect(rows[2].style.visibility).toBe("hidden"));
    expect(rows.slice(0, 2).map((r) => r.style.visibility)).toEqual(["", ""]);
  });

  it("строки, подросшие после загрузки шрифта, пересчитываются", async () => {
    // Measuring follows the metrics of the font drawn RIGHT NOW: before the web font arrives rows
    // are measured in the fallback and all fit. Once it arrives rows grow, and without a recount
    // the bottom one stays half past the edge.
    const geometry = stubRowGeometry({ listHeight: 100, rowHeight: 18 });
    let fontsReady: () => void = () => {};
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise<void>((resolve) => (fontsReady = () => resolve())) },
    });
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue(fiveRecent());

    render(<MusicTile />);

    const rows = await screen.findAllByTestId("recent-track");
    // Fallback font: 5 × 18 = 90 ≤ 96 — all of them fit.
    await waitFor(() => expect(rows[4].style.visibility).toBe(""));

    geometry.setRowHeight(25); // the web font arrived and the rows grew
    await act(async () => {
      fontsReady();
      await Promise.resolve();
    });
    // The 4th row ends at 100, past the list: hide it and everything below.
    await waitFor(() => expect(rows[3].style.visibility).toBe("hidden"));
  });

  it("список недавних лежит в обёртке .music-recent — свою высоту ей даёт CSS", async () => {
    // The list is positioned absolute inset-0 so its clientHeight equals the available room rather
    // than the content, which means the wrapper's whole height comes from the parent. In the
    // mobile stack the parent gives none ⇒ tracks are in the DOM but invisible (§8).
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue([
      { track: track({ title: "Ghosts 'n' Stuff" }), playedAt: "2026-06-18T10:00:00Z" },
    ]);

    render(<MusicTile />);

    const row = await screen.findByTestId("recent-track");
    expect(row.closest(".music-recent")).not.toBeNull();
  });

  it("уход вкладки в фон не дёргает опрос, возврат — обновляет немедленно", async () => {
    getNowPlayingMock.mockResolvedValue(nowView());
    getRecentMock.mockResolvedValue([]);

    const setVisibility = (value: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };

    try {
      render(<MusicTile />);
      expect(await screen.findByTestId("now-playing")).toBeInTheDocument();
      const baseline = getNowPlayingMock.mock.calls.length;

      // Hiding the tab sends no request by itself (polling stops).
      await act(async () => setVisibility("hidden"));
      expect(getNowPlayingMock.mock.calls.length).toBe(baseline);

      // Returning to the tab polls now-playing immediately (PRD §5.5).
      await act(async () => setVisibility("visible"));
      expect(getNowPlayingMock.mock.calls.length).toBe(baseline + 1);
    } finally {
      // Restore jsdom's prototype getter so it does not leak into neighbouring tests.
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it("сбой загрузки → состояние ошибки", async () => {
    getNowPlayingMock.mockRejectedValue(new Error("boom"));
    getRecentMock.mockRejectedValue(new Error("boom"));

    render(<MusicTile />);

    await waitFor(() => expect(screen.getByText("не удалось загрузить")).toBeInTheDocument());
  });
});
