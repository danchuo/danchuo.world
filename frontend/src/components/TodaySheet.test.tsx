import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DayView, DisciplineItemView } from "@/lib/api/types";
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

    expect(screen.getByText("сб 19.09")).toBeInTheDocument();
    expect(screen.getByText("сегодня")).toBeInTheDocument();
    expect(screen.getByText("суббота длиною в год")).toBeInTheDocument();
  });

  // The stamp and the relative word are edge markings; the name is the only line in full voice,
  // and it takes the width alone rather than starting mid-line after a separator. DESIGN §4.3
  it("keeps the stamp on the edge and the day's name in full voice", () => {
    const { container } = render(<TodaySheet day={day({ title: "суббота длиною в год" })} today="2026-09-19" />);

    const edge = container.querySelector(".today-sheet__edge")!;
    expect(edge.textContent).toBe("сб 19.09сегодня");
    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("суббота длиною в год");
  });

  it("gives the voice to the relative word when the day has no name", () => {
    const { container } = render(<TodaySheet day={day()} today="2026-09-19" />);

    // Said once, not twice: an unnamed day has one word, and the edge does not repeat it.
    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("сегодня");
    expect(container.querySelector(".today-sheet__edge")!.textContent).toBe("сб 19.09");
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

  it("drops the ledger plate of an item that already has a frame", () => {
    render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(screen.queryByRole("button", { name: /^Чтение:/ })).toBeNull();
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

  it("drops the frame row entirely on a day with no sittings", () => {
    const { container } = render(
      <TodaySheet day={day({ discipline: [item({ key: "stretch", count: 1 })] })} today="2026-09-19" />,
    );

    expect(container.querySelector(".today-sheet__frames")).toBeNull();
    expect(container.querySelector(".today-sheet--bare")).not.toBeNull();
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

  it("tells an unmarked monster from a clean one", () => {
    const { unmount } = render(<TodaySheet day={day()} today="2026-09-19" />);
    expect(screen.getByRole("button", { name: "Монстр: не отмечен" })).toBeInTheDocument();
    unmount();

    render(<TodaySheet day={day({ monsterDrunk: false, monsterCleanStreak: 14 })} today="2026-09-19" />);
    expect(
      screen.getByRole("button", { name: "Монстр: не выпит, 14 дн. подряд" }),
    ).toBeInTheDocument();
  });
});
