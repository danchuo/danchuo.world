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

/** Пять недавних треков — столько запрашивает плитка, когда ничего не играет. */
function fiveRecent(): RecentTrackView[] {
  return ["A", "B", "C", "D", "E"].map((t, i) =>
    recentOf({ title: t, url: `u:${t}` }, `2026-06-18T10:0${5 - i}:00Z`),
  );
}

const restore: Array<() => void> = [];

/**
 * Геометрия списка недавних: в jsdom всё по нулям, а подгонка [useFitOverflow] решает как раз
 * по ней. Задаём высоту списка и строк сами — так проверяется само правило, а не «в тестах
 * ничего не прячем». Строки идут встык, индекс берётся из позиции в родителе.
 */
function stubRowGeometry({
  listHeight,
  rowHeight,
  clipBottom,
}: {
  listHeight: number;
  rowHeight: number;
  /** Низ клипующего предка (колонка плитки): ниже него содержимое просто срезается. */
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

  // Обе геометрии живут на Element.prototype (не на HTMLElement) — иначе подмена шла бы
  // мимо, а восстановление падало на undefined-дескрипторе.
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
      // Сам список — всегда своей высоты: он тоже несёт `overflow-hidden`, и без этой
      // проверки раньше клипа тест «проходил» из-за подмены его собственного низа.
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

  it("ширина карточки НЕ анимируется — иначе WebKit размазывает её тень по боковым зазорам", async () => {
    // Здесь это било чаще всего: ширина едет на КАЖДОЙ смене трека. Карточка несёт
    // filter: drop-shadow (свой композитный слой), WebKit не подчищает освобождённую
    // сжатием область, и каждый кадр перегона оставлял полосу тени — под плиткой в Safari
    // копилась гребёнка (docs/pitfalls.md).
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
    // Метка относительная, поэтому «сейчас» в тесте фиксируем: иначе тест стареет вместе
    // с системными часами.
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
    // Обложка ряда — материал для волны; в разметке она есть при любой волне (скин её
    // включает или прячет), поэтому проверяем именно наличие картинки.
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
    // Возврат старой беды: нижний трек «срезался на половине» краем виджета, и полстроки букв
    // читались как мусор. В jsdom геометрия нулевая, поэтому задаём её сами: список 100px,
    // строка 30px ⇒ влезают три (запас FIT_MARGIN), остальные обязаны быть погашены.
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
    // Возврат беды владельца: после долгого отсутствия во вкладке виден четвёртый трек,
    // обрезанный низом плитки. Пока играл трек, списка на экране не было; трек доиграл,
    // список смонтировался заново с ТЕМ ЖЕ составом — и подгонка, привязанная к составу,
    // не перезапускалась: все пять строк оставались видимыми, лишние резал край.
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

      // Вкладка ушла в фон, трек доиграл; возврат приносит «ничего не играет».
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
    // Замер на живом борде: колонка плитки кончалась на 119.6px, а список (его min-height
    // задан ради мобильного стека) висел до 150.3 — то есть на 30px ниже видимого края.
    // Подгонка мерила свой низ, считала, что всё влезло, и нижнюю строку срезала сама плитка.
    stubRowGeometry({ listHeight: 100, rowHeight: 20, clipBottom: 62 });
    getNowPlayingMock.mockResolvedValue(nowView({ isPlaying: false, progressMs: null, track: null }));
    getRecentMock.mockResolvedValue(fiveRecent());

    render(<MusicTile />);

    const rows = await screen.findAllByTestId("recent-track");
    // Клип на 62 ⇒ с запасом влезают две строки (40 ≤ 56), третья (60) уже нет.
    await waitFor(() => expect(rows[2].style.visibility).toBe("hidden"));
    expect(rows.slice(0, 2).map((r) => r.style.visibility)).toEqual(["", ""]);
  });

  it("строки, подросшие после загрузки шрифта, пересчитываются", async () => {
    // Замер идёт по метрикам ТОГО шрифта, что нарисован сейчас: пока веб-шрифт не приехал,
    // строки меряются фолбэком и все влезают. Приехал — строки подросли, и без пересчёта
    // нижняя остаётся наполовину за краем (ровно то, что видно на проде, а не в jsdom).
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
    // Фолбэк-шрифт: 5 × 18 = 90 ≤ 96 — влезают все.
    await waitFor(() => expect(rows[4].style.visibility).toBe(""));

    geometry.setRowHeight(25); // веб-шрифт приехал, строки выросли
    await act(async () => {
      fontsReady();
      await Promise.resolve();
    });
    // 4-я строка кончается на 100 — за пределами списка; гасим её и всё, что ниже.
    await waitFor(() => expect(rows[3].style.visibility).toBe("hidden"));
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
