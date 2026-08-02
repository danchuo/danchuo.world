import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NowPlayingView, RecentTrackView, TrackView } from "@/lib/api/types";
import { MusicTile } from "./MusicTile";
import { collapseConsecutiveRecent } from "@/lib/recentTracks";

// Музыка тянет данные сама — мокаем JSON-клиент.
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

afterEach(() => {
  vi.clearAllMocks();
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
    // Сохраняем первый (самый свежий) элемент серии.
    expect(out[0].playedAt).toBe("t6");
  });

  it("различает треки по названию+артистам, когда url отсутствует", () => {
    const list = [
      recentOf({ title: "Same", url: null, artists: [{ name: "X", url: null }] }, "t3"),
      recentOf({ title: "Same", url: null, artists: [{ name: "Y", url: null }] }, "t2"),
      recentOf({ title: "Same", url: null, artists: [{ name: "Y", url: null }] }, "t1"),
    ];
    // Первые два — разные артисты ⇒ остаются; последние два одинаковы ⇒ схлопнулись.
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
    // Атрибуция-ссылки ведут на Spotify: и трек, и исполнитель.
    expect(screen.getByText("Strobe").closest("a")).toHaveAttribute("href", now.track!.url);
    expect(screen.getByText("deadmau5").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/d",
    );
    // Альбом — тоже ссылка-атрибуция.
    expect(screen.getByText("For Lack of a Better Name").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/album/a",
    );
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

  it("список недавних лежит в обёртке .music-recent — свою высоту ей даёт CSS", async () => {
    // Список позиционирован absolute inset-0 (чтобы его clientHeight равнялся доступному месту,
    // а не контенту), поэтому вся высота обёртки приходит от родителя. В мобильном стеке родитель
    // её не даёт ⇒ обёртка нулевая, треки есть в DOM, но не видны — «виджет без наполнения».
    // Пиксели проверяет CSS-контракт `app/styles/stackHeights.test.ts`.
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

      // Скрытие вкладки само по себе запрос не шлёт (поллинг останавливается).
      await act(async () => setVisibility("hidden"));
      expect(getNowPlayingMock.mock.calls.length).toBe(baseline);

      // Возврат на вкладку — немедленный опрос now-playing (PRD §5.5).
      await act(async () => setVisibility("visible"));
      expect(getNowPlayingMock.mock.calls.length).toBe(baseline + 1);
    } finally {
      // Возвращаем прототипный геттер jsdom, чтобы не протечь в соседние тесты.
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
