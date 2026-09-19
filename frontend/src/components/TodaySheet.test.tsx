import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DayView, DisciplineItemView, PodcastEpisodeView } from "@/lib/api/types";
import { TodaySheet } from "./TodaySheet";

function item(over: Partial<DisciplineItemView> & { key: string }): DisciplineItemView {
  return { label: over.key, icon: null, count: 0, target: 1, ...over };
}

function day(over: Partial<DayView> = {}): DayView {
  return {
    date: "2026-09-19",
    title: null,
    hasData: true,
    health: { steps: null, sleepMinutes: null },
    workouts: [],
    discipline: [],
    ...over,
  } as DayView;
}

const withBook = (over = {}) =>
  day({
    discipline: [
      item({
        key: "reading",
        label: "Чтение",
        target: 2,
        count: 1,
        books: [
          {
            title: "Пятая гора",
            author: "Пауло Коэльо",
            coverUrl: "https://i/book.jpg",
            startedAt: "2026-09-19T12:00:00Z",
            readMinutes: 24,
            startPercent: 0.43,
            endPercent: 0.58,
            sessionId: 11,
            hasSummary: true,
          },
        ],
      }),
    ],
    ...over,
  });

describe("TodaySheet", () => {
  it("prints the day in the ribbon's grammar rather than a split header", () => {
    render(<TodaySheet day={day({ title: "суббота длиною в год" })} today="2026-09-19" />);

    expect(screen.getByText("суббота 19.09")).toBeInTheDocument();
    expect(screen.getByText("суббота длиною в год")).toBeInTheDocument();
  });

  // The date closes the FOOT strip; the whole top is the day's name, which it may not compete
  // with. A named day does not also print "today" — the name has already said which day. §4.3
  it("stamps the date in the foot strip and gives the top to the name", () => {
    const { container } = render(<TodaySheet day={day({ title: "суббота длиною в год" })} today="2026-09-19" />);

    expect(container.querySelector(".today-sheet__foot .today-sheet__stamp")!.textContent).toBe("суббота 19.09");
    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("суббота длиною в год");
    expect(screen.queryByText("сегодня")).toBeNull();
  });

  it("gives the voice to the relative word when the day has no name", () => {
    const { container } = render(<TodaySheet day={day()} today="2026-09-19" />);

    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("сегодня");
    expect(container.querySelector(".today-sheet__foot .today-sheet__stamp")!.textContent).toBe("суббота 19.09");
  });

  // A sitting whose retelling never assembled is not a dead picture: the frame leads to the
  // episode at Spotify instead. A book has no such address and stays a picture. §4.3
  it("turns a frame with no retelling into a door to the episode", () => {
    const withEpisode = (over: Partial<PodcastEpisodeView>) =>
      day({
        discipline: [
          item({
            key: "podcasts",
            label: "Подкасты",
            target: 1,
            count: 1,
            episodes: [
              {
                episodeName: "Осада Вены",
                episodeUrl: "https://open.spotify.com/episode/x",
                showName: "The Rest Is History",
                showUrl: null,
                imageUrl: null,
                listenedMinutes: 20,
                startMinute: null,
                endMinute: null,
                sessionId: 9,
                hasSummary: false,
                startedAt: null,
                ...over,
              } as PodcastEpisodeView,
            ],
          }),
        ],
      });

    const { container } = render(<TodaySheet day={withEpisode({})} today="2026-09-19" />);
    const link = container.querySelector("a.today-sheet__frame") as HTMLAnchorElement;
    expect(link.href).toBe("https://open.spotify.com/episode/x");
    expect(link.getAttribute("rel")).toBe("noreferrer");

    const homeless = render(<TodaySheet day={withEpisode({ episodeUrl: null })} today="2026-09-19" />);
    expect(homeless.container.querySelector("a.today-sheet__frame")).toBeNull();
  });

  it("sizes the name from its own length, so a long one stays loud", () => {
    const short = render(<TodaySheet day={day({ title: "экстрадень" })} today="2026-09-19" />);
    const long = render(<TodaySheet day={day({ title: "т".repeat(74) })} today="2026-09-19" />);

    const size = (r: { container: HTMLElement }) =>
      (r.container.querySelector(".today-sheet__voice") as HTMLElement).style.fontSize;
    expect(size(short)).toContain("32px");
    expect(size(long)).toContain("cqw");
  });

  it("shows the covered chunk as a run on a track, not as percentages", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(screen.getByText("Пятая гора")).toBeInTheDocument();
    expect(screen.queryByText("43% → 58%")).toBeNull();
    const run = container.querySelector(".today-sheet__run") as HTMLElement;
    expect(parseFloat(run.style.left)).toBeCloseTo(43, 1);
    expect(parseFloat(run.style.width)).toBeCloseTo(15, 1);
  });

  it("speaks the covered chunk in the frame's label, since the track is decoration", () => {
    render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(
      screen.getByRole("button", { name: "Что было в прочитанном куске: Пятая гора, 43% → 58%" }),
    ).toBeInTheDocument();
  });

  // Nothing is ever hidden from the fixed row: the item whose sittings became frames keeps its
  // socket and says so, rather than dropping out and shifting every socket to its right. §4.3
  it("keeps the socket of an item that already has a frame, marked as framed", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(screen.getByRole("button", { name: "Чтение: есть свои кадры" })).toBeInTheDocument();
    expect(container.querySelector(".today-sheet__cell.is-framed")).not.toBeNull();
  });

  it("opens a sitting that has a retelling, and leaves one without it unopenable", () => {
    const { unmount } = render(<TodaySheet day={withBook()} today="2026-09-19" />);
    expect(screen.getByRole("button", { name: /Что было в прочитанном куске/ })).toBeInTheDocument();
    unmount();

    const mute = day({
      discipline: [
        item({
          key: "reading",
          target: 2,
          count: 1,
          books: [
            {
              title: "Пятая гора",
              author: null,
              coverUrl: null,
              startedAt: null,
              readMinutes: 24,
              startPercent: null,
              endPercent: 0.58,
              sessionId: null,
              hasSummary: false,
            },
          ],
        }),
      ],
    });
    render(<TodaySheet day={mute} today="2026-09-19" />);

    expect(screen.queryByRole("button", { name: /Что было в прочитанном куске/ })).toBeNull();
    expect(screen.getByText("Пятая гора")).toBeInTheDocument();
  });

  // The monster is a frame of the row, so a day with no sittings still has one picture standing:
  // the row never collapses, and the sheet is never an empty rectangle. DESIGN §4.3
  it("keeps the frame row on a day with no sittings, the monster standing alone in it", () => {
    const { container } = render(
      <TodaySheet day={day({ discipline: [item({ key: "stretch", count: 1 })] })} today="2026-09-19" />,
    );

    const row = container.querySelector(".today-sheet__frames")!;
    expect(row.querySelectorAll(".today-sheet__frame")).toHaveLength(0);
    expect(row.querySelectorAll(".today-sheet__monster")).toHaveLength(1);
    expect(container.querySelectorAll(".today-sheet__sockets .today-sheet__cell")).toHaveLength(1);
  });

  // The monster CLOSES the row rather than floating away at its far right edge.
  it("puts the monster last in the frame row, after every sitting", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    const kids = [...container.querySelector(".today-sheet__frames")!.children];
    expect(kids).toHaveLength(2);
    expect(kids[0].className).toContain("today-sheet__frame");
    expect(kids[1].className).toContain("today-sheet__monster");
  });

  // The row's shape is what the eye learns, so its column count follows the items rather than
  // letting a new one wrap onto a second row. DESIGN §4.3
  it("holds every item in the row, in order, and widens the row to fit them", () => {
    const { container } = render(
      <TodaySheet
        day={day({
          discipline: [
            item({ key: "stretch", label: "Растяжка", target: 1, count: 1 }),
            item({ key: "squash", label: "Сквош", target: 0, count: 0 }),
            item({ key: "office", label: "Офис", target: 1, count: 0 }),
          ],
        })}
        today="2026-09-19"
      />,
    );

    const names = [...container.querySelectorAll(".today-sheet__cellname")].map((n) => n.textContent);
    expect(names).toEqual(["растяжка", "Сквош", "офис"]);
    expect((container.querySelector(".today-sheet__sockets") as HTMLElement).style.getPropertyValue("--sheet-sockets")).toBe("3");
    expect(screen.getByRole("button", { name: "Сквош: не отмечен" })).toBeInTheDocument();
  });

  it("marks a not-yet-done item as open while keeping its live run beside it", () => {
    render(
      <TodaySheet
        day={day({
          discipline: [item({ key: "reading", label: "Чтение", target: 2, count: 1, occurrenceStreaks: [6, 0] })],
        })}
        today="2026-09-19"
      />,
    );

    expect(screen.getByRole("button", { name: "Чтение: не сделано, 6 дн. подряд" })).toBeInTheDocument();
    expect(screen.getByText("1/2 6д")).toBeInTheDocument();
  });

  it("spells the streak out in words for a screen reader", () => {
    render(
      <TodaySheet
        day={day({ discipline: [item({ key: "office", label: "Офис по расписанию", count: 1, occurrenceStreaks: [14] })] })}
        today="2026-09-19"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Офис по расписанию: сделано, 14 дн. подряд" }),
    ).toBeInTheDocument();
  });

  it("turns the calendar lens on from a ledger plate, and off on a second press", async () => {
    const onLensChange = vi.fn();
    const lens = { key: "stretch", occurrence: 1, label: "растяжка" };
    const { rerender } = render(
      <TodaySheet
        day={day({ discipline: [item({ key: "stretch", label: "Растяжка", count: 1 })] })}
        today="2026-09-19"
        onLensChange={onLensChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Растяжка/ }));
    expect(onLensChange).toHaveBeenCalledWith(lens);

    rerender(
      <TodaySheet
        day={day({ discipline: [item({ key: "stretch", label: "Растяжка", count: 1 })] })}
        today="2026-09-19"
        lens={lens}
        onLensChange={onLensChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Растяжка/ }));
    expect(onLensChange).toHaveBeenLastCalledWith(null);
  });

  // The monster is a card among the frames, not a socket: an unreported day shows the figure and
  // says nothing, because a silent monster is not a clean one (PRD §5.6).
  it("gives the monster a card of its own, silent on a day with no record", () => {
    const { container, unmount } = render(<TodaySheet day={day()} today="2026-09-19" />);
    expect(screen.getByRole("button", { name: "Монстр: не отмечен" })).toBeInTheDocument();
    expect(container.querySelector(".today-sheet__monster.is-unreported")).not.toBeNull();
    expect(container.querySelector(".today-sheet__monstersay")!.textContent).toBe("");
    expect(container.querySelector(".today-sheet__cell.is-unreported")).toBeNull();
    unmount();

    const clean = render(
      <TodaySheet day={day({ monsterDrunk: false, monsterCleanStreak: 14 })} today="2026-09-19" />,
    );
    expect(clean.container.querySelector(".today-sheet__monstersay")!.textContent).toBe("14 дней не пил");

    const drunk = render(<TodaySheet day={day({ monsterDrunk: true })} today="2026-09-19" />);
    expect(drunk.container.querySelector(".today-sheet__monster.is-drunk")).not.toBeNull();
    expect(drunk.getByText("пил")).toBeInTheDocument();
  });
});
