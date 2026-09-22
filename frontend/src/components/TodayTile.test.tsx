import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DayView } from "@/lib/api/types";
import { TodayTile } from "./TodayTile";

function dayFixture(over: Partial<DayView> = {}): DayView {
  return {
    date: "2026-06-18",
    title: "первый забег",
    hasData: true,
    health: { steps: 8421, sleepMinutes: 437, sleepStages: null },
    discipline: [
      { key: "reading", label: "чтение", icon: null, count: 2, target: 2 },
      { key: "stretch", label: "растяжка", icon: null, count: 0, target: 1 },
    ],
    // The monster was marked and drunk — `null` here would mean "not marked", not "not drunk".
    monsterDrunk: true,
    ...over,
  };
}

describe("TodayTile", () => {
  it("renders the date, the day name and the discipline trail map (stats moved, the monster is the map's detour)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);

    expect(screen.getByTestId("today-date")).toHaveTextContent("18 июня 2026");
    expect(screen.getByTestId("today-title")).toHaveTextContent("первый забег");
    // Steps and sleep moved out of "Today" into their own widgets.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.queryByText(/сон/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8.421/)).not.toBeInTheDocument();

    // discipline is the quest map: reading closed at both stops, stretching not
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-stretch-1")).toHaveAttribute("data-done", "false");
    // a flavour was chosen ⇒ the monster detour is closed; there is no separate monster block
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
    expect(screen.queryByText("Mango Loco")).not.toBeInTheDocument();
    // There is no "N/7" total in the tile — the route's stops show the progress.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("the date hints the day-of-life number with its own tooltip, not the system one", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);

    // 2002-06-06 (day №1) → 2026-06-18.
    expect(screen.getByRole("tooltip")).toHaveTextContent("8779-й день жизни");
    // There is no native tooltip on the date, and the help cursor went with it.
    const date = screen.getByTestId("today-date");
    expect(date).not.toHaveAttribute("title");
    expect(date.className).not.toContain("cursor-help");
    expect(date.querySelector(".cursor-help")).toBeNull();
  });

  it("before the owner's birth there is no hint on the date at all", () => {
    render(
      <TodayTile day={dayFixture({ date: "2002-06-05" })} today="2002-06-05" state="loaded" />,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("an empty day: null → \"no data\", the monster detour is not closed, no \"did not drink\" mark", () => {
    const empty = dayFixture({
      title: null,
      hasData: false,
      health: { steps: null, sleepMinutes: null, sleepStages: null },
      monsterDrunk: null,
    });
    render(<TodayTile day={empty} today="2026-06-18" state="loaded" />);

    expect(screen.queryByTestId("today-title")).not.toBeInTheDocument();
    // With no stats: the header plus the map, and no stats line in the tile.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "false");
    // Neither "not drunk" nor "drunk" — nobody marked the monster on an empty day.
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    expect(screen.queryByTestId("monster-none")).not.toBeInTheDocument();
  });

  it("a long day name wraps onto a second line instead of shrinking into one", () => {
    const long = "очень длинное имя дня про всё на свете"; // 38 characters
    render(<TodayTile day={dayFixture({ title: long })} today="2026-06-18" state="loaded" />);

    const title = screen.getByTestId("today-title");
    // Wrapping is allowed, and that is what gives the large size instead of squeezing to one line.
    expect(title.className).not.toContain("whitespace-nowrap");
    expect(title.className).toContain("w-3/5"); // the day's name gets 3/5 of the line
    // Capacity is computed over TWO lines: 192/38 ≈ 5.05cqw, and the 4cqw ceiling wins.
    expect(title.style.fontSize).toBe("clamp(max(2.2cqw, 11px), 5.05cqw, min(4cqw, 40px))");
  });

  it("a very long day name stays readable: twice as large as before and not below the floor", () => {
    // A real day name from production (2026-09-01), 74 characters — the one the owner called too small.
    const long =
      "тройной пресс на работе еще и люстру не починили а она и не ломалась кстати";
    expect(long).toHaveLength(75);
    render(<TodayTile day={dayFixture({ title: long })} today="2026-06-18" state="loaded" />);

    // It was 96/75 ≈ 1.28cqw on one line; now 192/75 = 2.56cqw on two — exactly twice as large.
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 2.56cqw, min(4cqw, 40px))",
    );
  });

  it("a day name longer than two lines hits the size floor instead of shrinking further", () => {
    const huge = "и".repeat(200);
    render(<TodayTile day={dayFixture({ title: huge })} today="2026-06-18" state="loaded" />);

    // 192/200 = 0.96cqw, below the floor: clamp returns max(2.2cqw, 11px) and the name takes more lines.
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 0.96cqw, min(4cqw, 40px))",
    );
  });

  it("a short day name keeps the shared size with the date line (floor/ceiling do not interfere)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);
    // a 12-character name: 192/12 = 16cqw > 4cqw, so the size stays 4cqw on one line
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 16.00cqw, min(4cqw, 40px))",
    );
  });

  it("the tile caption is relative to the selected date (not always \"today\")", () => {
    // The 17th selected while today is the 18th → "yesterday".
    render(<TodayTile day={dayFixture({ date: "2026-06-17" })} today="2026-06-18" state="loaded" />);
    expect(screen.getByText("вчера")).toBeInTheDocument();
    expect(screen.queryByText("сегодня")).not.toBeInTheDocument();
  });

  it("in the loading state the tile stays silent: no content, no empty frame", () => {
    // The tile keeps its cell but shows nothing until it has something to show (DESIGN §7.10).
    const { container } = render(<TodayTile day={null} today="2026-06-18" state="loading" />);
    expect(container.querySelector("[data-quiet]")).not.toBeNull();
    expect(screen.queryByTestId("today-date")).not.toBeInTheDocument();
  });

  // --- Weekend: the rest scene instead of the quest map (§5.6) ---------------------------------

  it("a weekend with a scene wave: the map gives way to the rest scene, monster checklist ✓ (did not drink)", () => {
    // 2026-06-21 is a Sunday; the monster is not drunk ⇒ a checklist tick, with no streaks.
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-21", monsterDrunk: false })}
        today="2026-06-21"
        state="loaded"
        wave="wave-01"
      />,
    );
    expect(screen.getByTestId("weekend-scene")).toBeInTheDocument();
    expect(screen.queryByTestId("quest-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("weekend-monster")).toHaveTextContent("монстр — не пил");
  });

  it("a weekend when the monster was drunk: the monster checklist in words", () => {
    // dayFixture sets a flavour by default ⇒ the monster was drunk.
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("weekend-monster-mark")).toHaveTextContent(/^пил$/);
  });

  it("\"drank\" and \"did not drink\" use DIFFERENT tokens, not shades of alarm", () => {
    // A regression anchor: "not drunk" used to take --accent, which on wave 01 is nearly the same
    // tone as --danger. The states differed by one word while the colour said "bad" either way.
    const mark = (drunk: boolean) => {
      const { unmount } = render(
        <TodayTile
          day={dayFixture({ date: "2026-06-21", monsterDrunk: drunk })}
          today="2026-06-21"
          state="loaded"
          wave="wave-01"
        />,
      );
      const style = screen.getByTestId("weekend-monster-mark").getAttribute("style") ?? "";
      unmount();
      return style;
    };

    expect(mark(false)).toContain("--accent-clean");
    expect(mark(true)).toContain("--danger");
    // Nor is the green borrowed from another role: --accent-code is the GitHub contributions channel.
    expect(mark(false)).not.toContain("--accent-code");
  });

  it("a day without a record: the monster is grey and silent — missing data is not passed off as a clean day", () => {
    // A future day or a hole in the history: nobody marked it, so there is no verdict.
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-18", hasData: false, monsterDrunk: null })}
        today="2026-06-18"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent(/^монстр$/);
  });

  it("there is a record for the day with an empty monster — an honest \"did not drink\" (the shortcut sent an empty monster)", () => {
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-18", hasData: true, monsterDrunk: false })}
        today="2026-06-18"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "clean");
    expect(screen.getByTestId("quest-monster-verb")).toHaveTextContent("не пил");
  });

  it("a weekend without a record: the scene does not claim \"did not drink\" but says \"no data\"", () => {
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-21", hasData: false, monsterDrunk: null })}
        today="2026-06-21"
        state="loaded"
        wave="wave-01"
      />,
    );
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.getByTestId("weekend-monster-mark")).toHaveTextContent("нет данных");
  });

  it("a weekday keeps the trail map even on a wave with a scene", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-18" })} today="2026-06-18" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });

  it("a weekend without a scene wave: no scene, the map stays (graceful fallback)", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-02" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });
});
