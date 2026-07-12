import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NowPlayingView, RecentTrackView, TrackView } from "@/lib/api/types";
import { MusicTile } from "./MusicTile";

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

afterEach(() => {
  vi.clearAllMocks();
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

  it("без now-playing, но с недавними — показывает список недавних", async () => {
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    const recent: RecentTrackView[] = [
      { track: track({ title: "Ghosts 'n' Stuff" }), playedAt: "2026-06-18T10:00:00Z" },
    ];
    getRecentMock.mockResolvedValue(recent);

    render(<MusicTile />);

    expect(await screen.findByTestId("recent-track")).toHaveTextContent("Ghosts 'n' Stuff");
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
