import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "@/lib/date";
import { Calendar } from "./Calendar";

const TODAY = "2026-06-18";

/** A past day with nothing recorded — a hole in the record, not "has not happened yet". */
const GAP = "2026-06-10";

function buildWindow(today: string = TODAY): DaySummary[] {
  const { from, to } = weekWindowAround(today, 2, 1);
  return datesInRange(from, to).map((date) => ({
    date,
    title: date === today ? "сегодня-день" : null,
    hasData: date <= today && date !== GAP,
    steps: date === today ? 8421 : null,
    sleepMinutes: null,
    contributions: null,
    // Stretching is done on even dates — material for the lens.
    disciplineCounts: { stretch: Number(date.slice(8)) % 2 === 0 ? 1 : 0, reading: 2 },
    // The monster was marked on every day with a record, or the lens would be silent everywhere.
    monsterDrunk: date <= today && date !== GAP ? false : null,
  }));
}

const STRETCH_LENS = { key: "stretch", occurrence: 1, label: "растяжка" };
const MONSTER_LENS = { key: "monster", occurrence: 1, label: "монстр" };

/** Drunk on the 16th, clean on the 17th; GAP is still unanswered — material for the monster lens. */
function buildMonsterWindow(): DaySummary[] {
  return buildWindow().map((d) =>
    d.date === "2026-06-16"
      ? { ...d, monsterDrunk: true }
      : d,
  );
}

describe("Calendar — weekend column", () => {
  it("a future weekend stays a weekend, not a future day", () => {
    // Fill priority: neighbouring month → weekend → future. Half the window is the future, and
    // without this rule half of the Sat/Sun column would be painted "future" and the weekend
    // column would break off at today.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 20 and 21 June 2026 are Saturday and Sunday, both later than TODAY (the 18th, a Thursday).
    for (const date of ["2026-06-20", "2026-06-21"]) {
      const cell = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(cell).toContain("var(--cal-weekend)");
      expect(cell).not.toContain("var(--bg-surface-muted)");
    }
  });

  it("a past weekend uses the same token as a future one", () => {
    // The column must read as solid top to bottom, or "weekend" becomes a shade of "when",
    // and that channel is taken.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const past = screen.getByTestId("day-2026-06-13").getAttribute("style") ?? "";
    const future = screen.getByTestId("day-2026-06-20").getAttribute("style") ?? "";
    expect(past).toContain("var(--cal-weekend)");
    expect(future).toContain("var(--cal-weekend)");
  });
});

describe("Calendar (window of whole weeks)", () => {
  it("draws a continuous grid of 4 whole weeks = 28 cells with day numbers", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(28);
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveTextContent("18");
  });

  it("marks today (aria-current) and a named day", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("name-mark-2026-06-18")).toBeInTheDocument();
  });

  it("the monster is not shown in a cell: no mark, no line in the hover summary", () => {
    // A day the monster WAS drunk on — without the lens the cell says nothing about it (§6).
    render(
      <Calendar days={buildMonsterWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const cell = screen.getByTestId("day-2026-06-16");
    expect(screen.queryByTestId("monster-pixel-2026-06-16")).not.toBeInTheDocument();
    expect(cell.getAttribute("title")).not.toContain("монстр");
    expect(cell.getAttribute("aria-label")).not.toContain("монстр");
    expect(cell.getAttribute("title")).toContain("шаги");
  });

  it("marks weekends and the neighbouring month's days", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 2026-06-13 is a Saturday, 2026-06-14 a Sunday (today is the 18th, a Thursday).
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-14")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-18")).not.toHaveAttribute("data-weekend");
  });

  it("tells a gap in the record from a future day", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    // A past day with data, and a future one where data cannot exist, are not gaps.
    expect(screen.getByTestId("day-2026-06-11")).not.toHaveAttribute("data-gap");
    expect(screen.getByTestId("day-2026-06-25")).not.toHaveAttribute("data-gap");
    // Today is still running: being unfilled is not a hole, and its own frame wins.
    expect(screen.getByTestId(`day-${TODAY}`)).not.toHaveAttribute("data-gap");
  });

  it("the month is not marked with a fill at all — neither its own days nor others'", () => {
    // The "foreign month" fill is gone (§5.3): it depended on where the window sat, so paging
    // inverted the whole sheet at once. A month is marked by its border, not by tone.
    const stride = "2026-07-02"; // window 15.06 → 12.07 — a month edge
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    for (const date of ["2026-06-15", "2026-06-20", "2026-06-22", "2026-07-02"]) {
      expect(screen.getByTestId(`day-${date}`).getAttribute("style") ?? "").not.toContain(
        "othermonth",
      );
    }
  });

  it("another month's figure is not dimmed: the month is told by the seam, not by tone", () => {
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    const june = screen.getByTestId("day-2026-06-22").getAttribute("style") ?? "";
    const july = screen.getByTestId("day-2026-07-01").getAttribute("style") ?? "";
    expect(june).toContain("var(--text-primary)");
    expect(july).toContain("var(--text-primary)");
  });

  it("a weekend stays a weekend in any month of the window", () => {
    // A regression anchor: the Sat/Sun column keeps its own token inside a foreign month too.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    for (const date of ["2026-06-20", "2026-06-21", "2026-07-04"]) {
      expect(screen.getByTestId(`day-${date}`).getAttribute("style") ?? "").toContain(
        "var(--cal-weekend)",
      );
    }
  });

  it("the month boundary is drawn as segments in its own layer, not as pieces inside cells", () => {
    // Window 15.06 → 12.07, with 1 July a Wednesday: the edge is a step — a vertical left of the
    // 1st, a horizontal along the tail of row 2 and the head of row 3. Pieces drawn inside cells
    // overlapped into the gutter and depended on the cell's border width.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(screen.getByTestId("month-edge-h-2-2-7")).toBeInTheDocument();
    expect(screen.getByTestId("month-edge-h-3-0-2")).toBeInTheDocument();
    expect(screen.getByTestId("month-edge-v-2-2")).toBeInTheDocument();
    // Exactly three segments — the run is not scattered across cells.
    expect(document.querySelectorAll(".cal-month-edge")).toHaveLength(3);
    expect(screen.getByTestId("day-2026-07-01").querySelector(".cal-month-edge")).toBeNull();
  });

  it("the boundary layer does not intercept clicks on days", () => {
    // The layer covers the whole grid, so without `pointer-events: none` it would eat navigation.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    const layer = document.querySelector(".cal-month-edges");
    expect(layer).toHaveAttribute("aria-hidden");
    expect(layer?.className).toContain("cal-month-edges");
  });

  it("the first day of a month is named in words — the boundary says \"where\", the caption \"which\"", () => {
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(screen.getByTestId("month-mark-2026-07-01")).toHaveTextContent(/июл/i);
    // An ordinary day carries no label, or the grid would turn into a list of months.
    expect(screen.queryByTestId("month-mark-2026-07-02")).toBeNull();
  });

  it("a seam with the CURRENT month is silent — no line, no caption", () => {
    // In the home window a border would be constant noise — the month is already named by the
    // "Today" tile. The mark earns its place in history, where months merge. Window 20.07 → 16.08
    // with today on 4 August: the 01.08 edge starts the current month.
    const stride = "2026-08-04";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(document.querySelectorAll(".cal-month-edge")).toHaveLength(0);
    expect(screen.queryByTestId("month-mark-2026-08-01")).toBeNull();
  });

  it("the window's top edge is not marked as a boundary — it is the sample's cut, not a month seam", () => {
    // Window 15.06 → 12.07: the first row starts on 15 June with nothing above it.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    // July's edge IS drawn, so the check about the first row is not vacuous.
    expect(screen.getByTestId("month-edge-v-2-2")).toBeInTheDocument();
    expect(document.querySelector('[data-testid^="month-edge-h-0-"]')).toBeNull();
  });

  it("a click on a day refocuses (onSelect with the date)", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={onSelect} state="loaded" />,
    );
    await userEvent.click(screen.getByTestId("day-2026-06-21"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-21");
  });

  it("without a lens cells are not marked with its answer (the calendar as before)", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId("day-2026-06-16")).not.toHaveAttribute("data-lens");
    expect(screen.getByText("календарь")).toBeInTheDocument();
  });

  it("the lens marks days: matched / not matched / no answer", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16")).toHaveAttribute("data-lens", "yes");
    expect(screen.getByTestId("day-2026-06-17")).toHaveAttribute("data-lens", "no");
    // A hole in the record and a future day give no answer — we do not read them as "did not do it"
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-lens", "unknown");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-lens", "unknown");
  });

  it("a matching day carries a frame mark, the cell's fill is left untouched", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("lens-frame-2026-06-16")).toBeInTheDocument();
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
    // The weekend fill stays its own: the lens does not replace it ("when" is untouchable)
    const weekend = screen.getByTestId("day-2026-06-13");
    expect(weekend.getAttribute("style")).toContain("var(--cal-weekend)");
    expect(weekend.getAttribute("style")).not.toContain("color-mix");
  });

  it("the lens does not take away a cell's own states (gap/weekend/today)", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
  });

  it("the lens answer goes into the hover summary and the screen reader caption", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16").getAttribute("title")).toContain("растяжка: сделано");
    expect(screen.getByTestId("day-2026-06-17").getAttribute("aria-label")).toContain(
      "растяжка: не сделано",
    );
    expect(screen.getByTestId(`day-${GAP}`).getAttribute("title")).not.toContain("растяжка");
  });

  it("the tile label names the lens and lets you remove it with a cross", async () => {
    const onLensChange = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
        onLensChange={onLensChange}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("растяжка");
    await userEvent.click(screen.getByTestId("calendar-lens-reset"));
    expect(onLensChange).toHaveBeenCalledWith(null);
  });

  it("the monster lens label names the lens's subject: the cells themselves carry the polarity", () => {
    // Inverting to "monster not drunk" was a crutch for a one-sided mark — see `lensTitle`.
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("календарь — монстр");
  });

  it("the monster lens marks ONLY \"drank\" — clean days stay ordinary cells", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    // The 16th, drunk: an alarming mark. The day used to just dim, making "drunk" indistinguishable
    // from "did not read" under any other lens — that signal was what the grid lacked.
    const drunk = screen.getByTestId("lens-frame-2026-06-16");
    expect(drunk.getAttribute("class")).toContain("cal-lens-digit--drunk");
    // The 17th, clean: NO mark. A green frame on clean days was rejected (DESIGN §5.1).
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    // A hole in the record answers even less.
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
  });

  it("a day without the shortcut run is not clean: no mark and no \"did not drink\" line", () => {
    // The day has a record (health ingest creates it), but nobody marked the monster.
    const days = buildWindow().map((d) =>
      d.date === "2026-06-17" ? { ...d, monsterDrunk: null } : d,
    );
    render(
      <Calendar
        days={days}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    const cell = screen.getByTestId("day-2026-06-17");
    expect(cell).toHaveAttribute("data-lens", "unknown");
    expect(cell.getAttribute("title")).not.toContain("не пил");
  });

  it("a marked \"drank\" does not dim along with the rest: dimming and marking are mutually exclusive channels", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    // An ordinary lens dims "no match", which is an absence. For the monster it is an event, and
    // dimming it while also marking it would speak about it in two voices at once.
    expect(screen.getByTestId("day-2026-06-16").getAttribute("style")).toContain(
      "var(--text-primary)",
    );
  });

  it("the monster's hover summary speaks with the same verdict as the trail map", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16").getAttribute("title")).toContain("пил монстр");
    expect(screen.getByTestId("day-2026-06-17").getAttribute("title")).toContain("не пил монстр");
  });

  it("the grid carries its own proportion — in the mobile stack nobody gives it a height", () => {
    // DESIGN §8: in bento the height comes from a board pinned to the viewport, in the stack there
    // is none, so a block derived from its parent would collapse to a strip of digits. The
    // proportion is computed from the window's week count rather than hardcoded.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByRole("grid").style.aspectRatio).toBe("7 / 4");
  });

  it("the proportion has nothing to set the grid's WIDTH with — otherwise the calendar spills out of the tile", () => {
    // The §8 trick only works as a full triple (the reference is `.quest-map`). Without
    // `width: 100%` the proportion may size the width instead of the height, as Safari did; without
    // `flex: 1 1 auto` the proportion takes the height too. One cause, so one lock.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const grid = screen.getByRole("grid");
    expect(grid.style.width).toBe("100%");
    expect(grid.style.flex).toBe("1 1 auto");
    // The Tailwind class with basis 0% must not come back behind the inline flex.
    expect(grid.className).not.toMatch(/flex-1/);
  });

  it("in the error state shows a quiet retry", async () => {
    const onRetry = vi.fn();
    render(
      <Calendar days={[]} selected={TODAY} today={TODAY} onSelect={() => {}} state="error" onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByText("повторить"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("Calendar — paging past weeks (§5.3)", () => {
  /** A window around [anchor] with "today" living apart — material for a shifted window. */
  function windowAround(anchor: string, today: string): DaySummary[] {
    const { from, to } = weekWindowAround(anchor, 2, 1);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= today,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: { stretch: 0, reading: 0 },
      monsterDrunk: null,
    }));
  }

  it("without a paging handler the calendar has no arrows at all", () => {
    // A regression anchor: the home tile grew no chrome where there is nothing to page through.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("at home only the back arrow is visible", () => {
    // There is nowhere forward from today and nowhere to come back from — both buttons would be dead.
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-prev")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
    expect(screen.queryByTestId("calendar-home")).toBeNull();
  });

  it("the back arrow pages exactly one week", async () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-prev"));
    expect(onShiftWeeks).toHaveBeenCalledWith(-1);
  });

  it("the wheel up pages back without scrolling the page", () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    const tile = screen.getByLabelText("Календарь");
    const consumed = !fireEvent.wheel(tile, { deltaY: -100 });
    expect(onShiftWeeks).toHaveBeenCalledWith(-1);
    expect(consumed).toBe(true);
  });

  it("at home the wheel down neither pages nor intercepts the page scroll", () => {
    // Nowhere forward from today, so the gesture must fall through to the page as if the tile
    // were not there.
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    const consumed = !fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: 100 });
    expect(onShiftWeeks).not.toHaveBeenCalled();
    expect(consumed).toBe(false);
  });

  it("at genesis the wheel up is silent: there is nowhere to page back to", () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
        canGoBack={false}
      />,
    );
    fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: -100 });
    expect(onShiftWeeks).not.toHaveBeenCalled();
  });

  it("in a shifted window the wheel down pages forward", () => {
    const onShiftWeeks = vi.fn();
    const anchor = "2026-06-11";
    render(
      <Calendar
        days={windowAround(anchor, "2026-07-02")}
        selected={"2026-07-02"}
        today="2026-07-02"
        anchor={anchor}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: 100 });
    expect(onShiftWeeks).toHaveBeenCalledWith(1);
  });

  it("small touchpad deltas add up to one step, and the inertia after it is swallowed", () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    const tile = screen.getByLabelText("Календарь");
    for (let i = 0; i < 8; i++) fireEvent.wheel(tile, { deltaY: -20 });
    expect(onShiftWeeks).toHaveBeenCalledTimes(1);
  });

  it("without a paging handler the wheel intercepts nothing", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const consumed = !fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: -100 });
    expect(consumed).toBe(false);
  });

  it("a shifted window gives a forward step and a return to today", async () => {
    const onShiftWeeks = vi.fn();
    const onResetWindow = vi.fn();
    const anchor = "2026-06-11";
    render(
      <Calendar
        days={windowAround(anchor, "2026-07-02")}
        selected={"2026-07-02"}
        today="2026-07-02"
        anchor={anchor}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
        onResetWindow={onResetWindow}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-next"));
    expect(onShiftWeeks).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalledOnce();
  });

  it("at the genesis boundary there is no back arrow", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        canGoBack={false}
      />,
    );
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
  });

  it("a shifted window names its month, not \"today\"", () => {
    render(
      <Calendar
        days={windowAround("2026-06-11", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-11"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-window-month")).toHaveTextContent("июнь");
  });

  it("a month of another year is named together with the year", () => {
    render(
      <Calendar
        days={windowAround("2025-12-10", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2025-12-10"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-window-month")).toHaveTextContent("декабрь 2025");
  });

  it("a day's look does not depend on the window position — paging repaints nothing", () => {
    // The main contract of this change. While a month was marked by an own/foreign fill, the
    // anchor moved the tone of EVERY cell: once every four or five clicks it crossed a month
    // border and the whole sheet inverted — that read as paging, not as moving by a week.
    const days = windowAround("2026-06-25", "2026-07-02");
    const first = render(
      <Calendar
        days={days}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-25"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    const before = screen.getByTestId("day-2026-06-15").getAttribute("style");
    first.unmount();

    // The same window with the anchor in another month — the cell must look exactly the same.
    render(
      <Calendar
        days={days}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-07-02"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("day-2026-06-15").getAttribute("style")).toBe(before);
  });

  it("\"today\" and \"future\" stay tied to the real date, not to the anchor", () => {
    // The anchor moves only the window and the month's reference. Today's frame, the dimming of
    // the future and a gap in the record are all counted from the real day, or a paged-away
    // window would start to lie.
    render(
      <Calendar
        days={windowAround("2026-06-25", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-25"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("day-2026-07-02")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("day-2026-07-03")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("day-2026-06-15")).not.toHaveAttribute("data-future");
  });
});

describe("Calendar — the \"field\" edition (§5.2)", () => {
  function renderField(days = buildWindow(), extra: Record<string, unknown> = {}) {
    return render(
      <Calendar
        days={days}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        {...extra}
      />,
    );
  }

  it("the base edition sets up no field — an unknown wave must not get it by accident", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" edition="таблица" />,
    );
    expect(document.querySelector(".cal-grid--field")).toBeNull();
    // The frame and the fill stay inline, as in the base.
    expect(screen.getByTestId(`day-${TODAY}`).getAttribute("style")).toContain("border");
  });

  it("in the field a cell carries neither a frame nor a fill — the look is entirely the skin's", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field")).not.toBeNull();
    const style = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(style).not.toContain("border:");
    expect(style).not.toContain("background:");
  });

  it("a cell carries the day's weight as a variable, not a ready colour", () => {
    renderField();
    // Two of today's four channels arrived: steps (8421 of 10000) and discipline (both items
    // closed). Sleep and contributions are absent and honestly drag the weight down.
    const today = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(today).toMatch(/--day-weight:\s*0\.461/);
  });

  it("a future day and a gap have zero weight", () => {
    renderField();
    for (const date of ["2026-06-20", GAP]) {
      const style = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(style).toMatch(/--day-weight:\s*0\.000/);
    }
  });

  it("an active lens dims the field: the light and the mark do not fight over one tone", () => {
    renderField(buildWindow(), { lens: STRETCH_LENS, onLensChange: () => {} });
    expect(document.querySelector(".cal-grid--field[data-lens]")).not.toBeNull();
  });

  it("without a lens there is nothing to dim", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field[data-lens]")).toBeNull();
  });

  it("no \"has a name\" dot in the field — the cell's light answers \"did the day arrive\"", () => {
    renderField();
    expect(screen.queryByTestId(`name-mark-${TODAY}`)).toBeNull();
    // In the base edition the dot stays: light is not counted there at all.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`name-mark-${TODAY}`)).toBeInTheDocument();
  });

  it("no native tooltip in the field, while the day summary stays for screen readers", () => {
    renderField();
    const cell = screen.getByTestId(`day-${TODAY}`);
    expect(cell).not.toHaveAttribute("title");
    expect(cell.getAttribute("aria-label")).toContain("шаги");
  });
})

describe("Calendar — paging by edge weeks (§5.2)", () => {
  /** A window a week wider than the grid on each side — exactly what the board sends this edition. */
  function buildWideWindow(today: string = TODAY): DaySummary[] {
    const { from, to } = weekWindowAround(today, 3, 2);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= today && date !== GAP,
      steps: date <= today ? 5000 : null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: { stretch: 1, reading: 0 },
      monsterDrunk: null,
    }));
  }

  function renderEdge(extra: Record<string, unknown> = {}) {
    const onShiftWeeks = vi.fn();
    const onSelect = vi.fn();
    const onFocusDay = vi.fn();
    render(
      <Calendar
        days={buildWideWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={onSelect}
        onFocusDay={onFocusDay}
        state="loaded"
        edition="field"
        edgeWeeks={1}
        onShiftWeeks={onShiftWeeks}
        onResetWindow={() => {}}
        {...extra}
      />,
    );
    return { onShiftWeeks, onSelect, onFocusDay };
  }

  it("a day pulled into the grid makes no PHANTOM step: the window did not shift", () => {
    // `onFocusDay` anchors ON a day, and the window is built around that day's WEEK. An anchor on
    // any day of this week gives the very same window, so comparing dates lit the forward edge,
    // the "today" button and the month heading — as if the reader had paged, having picked a day.
    renderEdge({ anchor: "2026-06-16", onResetWindow: () => {} });
    expect(screen.queryByTestId("calendar-edge-next")).not.toBeInTheDocument();
    expect(screen.queryByTestId("calendar-window-month")).not.toBeInTheDocument();
  });

  it("the window's slide plays on a WEEK change, not on an anchor change", () => {
    // The glide is the window travelling through weeks. An anchor inside this week moves nothing,
    // and playing it there read as the calendar jumping vertically on a plain change of day.
    const field = (anchor: string) => (
      <Calendar
        days={buildWideWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        onFocusDay={() => {}}
        state="loaded"
        edition="field"
        edgeWeeks={1}
        onShiftWeeks={() => {}}
        onResetWindow={() => {}}
        anchor={anchor}
      />
    );
    const { container, rerender } = render(field(TODAY));

    rerender(field("2026-06-16")); // same week as today
    expect(container.querySelector("[data-roll]")).toBeNull();

    rerender(field("2026-06-04")); // a real step back
    expect(container.querySelector("[data-roll]")).not.toBeNull();
  });

  it("a real step lights the forward edge", () => {
    renderEdge({ anchor: "2026-06-04", onResetWindow: () => {} });
    expect(screen.getByTestId("calendar-edge-next")).toBeInTheDocument();
  });

  it("a click on an edge day pulls it into the grid instead of paging blindly", async () => {
    const { onShiftWeeks, onFocusDay } = renderEdge();
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[3];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onFocusDay).toHaveBeenCalledWith(date);
    // A week-long step gives no such guarantee: a month break eats a row and the day stays off
    // the grid — which is why the gesture has its own anchor rather than paging.
    expect(onShiftWeeks).not.toHaveBeenCalled();
  });

  it("without a \"pull into the grid\" handler a click on the edge just selects the day", async () => {
    const { onSelect } = renderEdge({ onFocusDay: undefined });
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[0];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(date);
  });

  it("no native tooltip with the week range on the edge", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge).not.toHaveAttribute("title");
    expect([...edge.querySelectorAll("button")].some((b) => b.hasAttribute("title"))).toBe(false);
  });

  it("edge weeks do not enter the grid — the grid's height does not depend on them", () => {
    renderEdge();
    // A 42-day window: one week goes into the tail margin and two more do not fit the height
    // ceiling (§5.2), leaving three rows — the two past weeks and the current one.
    expect(screen.getAllByRole("gridcell")).toHaveLength(21);
  });

  it("each edge day has its own button: their actions differ", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge.tagName).not.toBe("BUTTON");
    expect(edge.querySelectorAll("button.cal-edge-cell")).toHaveLength(7);
  });

  it("edge cells carry the day's weight — the strip glows instead of just numbering", () => {
    renderEdge();
    const cells = screen.getByTestId("calendar-edge-prev").querySelectorAll(".cal-edge-cell");
    const lit = [...cells].filter((c) =>
      /--day-weight:\s*0\.[1-9]/.test(c.getAttribute("style") ?? ""),
    );
    expect(lit.length).toBeGreaterThan(0);
  });

  it("no arrows in the field: the edge carries the step, a glyph would say it twice", () => {
    renderEdge({ anchor: "2026-06-04" });
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("at home the paging row is not drawn at all — an empty row would read as a hole", () => {
    renderEdge();
    expect(document.querySelector(".cal-nav")).toBeNull();
    expect(screen.queryByTestId("calendar-edge-next")).toBeNull();
  });

  it("a shifted window gets a forward edge and a \"today\" return", async () => {
    const { onFocusDay } = renderEdge({ anchor: "2026-06-04" });
    expect(screen.getByTestId("calendar-home")).toBeTruthy();
    const next = screen.getByTestId("calendar-edge-next").querySelectorAll("button")[0];
    const date = next.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(next);
    expect(onFocusDay).toHaveBeenCalledWith(date);
  });

  it("at genesis there is no back edge, and its days go to the grid", () => {
    renderEdge({ canGoBack: false });
    expect(screen.queryByTestId("calendar-edge-prev")).toBeNull();
    expect(screen.getAllByRole("gridcell")).toHaveLength(35);
  });

  it("\"today\" moves from the label to the tile's bottom edge — no row appears on top", async () => {
    const onResetWindow = vi.fn();
    renderEdge({ anchor: "2026-06-04", onResetWindow });
    const home = screen.getByTestId("calendar-home");
    expect(home.className).toContain("cal-home-pill");
    // The control row is gone from the shortcut entirely — that is why the pill moved down.
    expect(document.querySelector(".cal-nav")).toBeNull();
    await userEvent.click(home);
    expect(onResetWindow).toHaveBeenCalled();
  });

  it("\"today\" returns both the window and the selected day", async () => {
    const onResetWindow = vi.fn();
    const { onSelect } = renderEdge({ anchor: "2026-06-04", selected: "2026-06-02", onResetWindow });
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("the base edition keeps \"today\" in the paging row", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        anchor="2026-06-04"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={() => {}}
      />,
    );
    const home = screen.getByTestId("calendar-home");
    expect(home.className).toContain("cal-nav-home");
    expect(document.querySelector(".cal-nav")?.contains(home)).toBe(true);
  });

  it("the base edition's \"today\" returns the selected day just like the \"field\" pill", async () => {
    const onResetWindow = vi.fn();
    const onSelect = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected="2026-06-02"
        today={TODAY}
        anchor="2026-06-04"
        onSelect={onSelect}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={onResetWindow}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("the base edition sets up no edges and keeps the arrows", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.queryByTestId("calendar-edge-prev")).toBeNull();
    expect(screen.getByTestId("calendar-prev")).toBeTruthy();
  });
});

describe("Calendar — a month starts on a new row (§5.2)", () => {
  /** A Wednesday in September: the window spans the edge, and 1 September 2026 is a Tuesday. */
  const SEP = "2026-09-15";

  /** Window 2026-08-31 … 2026-09-27 — four weeks, of which August took a single day. */
  function crossWindow(): DaySummary[] {
    const { from, to } = weekWindowAround(SEP, 2, 1);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= SEP,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: undefined,
      monsterDrunk: null,
    }));
  }

  function renderCross(extra: Record<string, unknown> = {}) {
    return render(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        {...extra}
      />,
    );
  }

  it("the first day moves to a new row — the seam marks the wrap, not a line", () => {
    renderCross();
    // Monday 31 August stays the last day of its row; Tuesday 1 September starts the next one
    // and stands in its own weekday column.
    expect(screen.getByTestId("day-2026-08-31").getAttribute("style")).toContain("grid-row: 1");
    const first = screen.getByTestId("day-2026-09-01").getAttribute("style") ?? "";
    expect(first).toContain("grid-row: 2");
    expect(first).toContain("grid-column: 2");
    expect(document.querySelector(".cal-month-edges")).toBeNull();
  });

  it("the month name goes into the empty piece before it, not into a day cell", () => {
    renderCross();
    const mark = screen.getByTestId("month-gap-2026-09-01");
    expect(mark).toHaveTextContent(/сентябрь/i);
    // The new row's head is one Monday, so the name moves into the previous row's wide tail:
    // the six cells left over from August.
    expect(mark.getAttribute("style")).toContain("grid-row: 1");
    expect(mark.getAttribute("style")).toContain("grid-column: 2 / 8");
    expect(screen.queryByTestId("month-mark-2026-09-01")).toBeNull();
  });

  it("the grid grows by a row: a wrap costs a week of slots", () => {
    renderCross();
    const grid = document.querySelector(".cal-grid--field") as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain("repeat(5");
    // The proportion follows the same row count, or the grid would spill out of the tile.
    expect(grid.style.aspectRatio).toBe("7 / 5");
  });

  it("with edges a wrap does not grow the grid: the top row goes past the edge", () => {
    // The window the board sends this edition: two past weeks and the current one, plus a week of
    // margin each side. A month break adds a row and the top one becomes surplus, so the tile's
    // height does not depend on whether a month edge fell inside the window.
    const { from, to } = weekWindowAround(SEP, 3, 1);
    const wide = datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= SEP,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: undefined,
      monsterDrunk: null,
    })) as DaySummary[];
    render(
      <Calendar
        days={wide}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        edgeWeeks={1}
        onShiftWeeks={() => {}}
      />,
    );
    const grid = document.querySelector(".cal-grid--field") as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain("repeat(3");
    // 31 August stood alone in the trimmed row — it is one step back.
    expect(screen.queryByTestId("day-2026-08-31")).toBeNull();
    // Its empty piece left with the row, so the month is named by the cell.
    expect(screen.queryByTestId("month-gap-2026-09-01")).toBeNull();
    expect(screen.getByTestId("month-mark-2026-09-01")).toHaveTextContent(/сен/i);
  });

  it("the window's movement is marked with a direction — the skin draws the slide by it", () => {
    const { rerender } = renderCross({ anchor: SEP });
    const frame = () => document.querySelector(".tile-frame")?.getAttribute("data-roll");
    // A still window is not marked: the surge is an event, not a state.
    expect(frame()).toBeNull();

    rerender(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        anchor="2026-09-08"
        onSelect={() => {}}
        state="loaded"
        edition="field"
      />,
    );
    expect(frame()).toBe("back");
  });

  it("the base edition sets up no fade-in", () => {
    const { rerender } = render(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor={SEP} onSelect={() => {}} state="loaded" />,
    );
    rerender(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor="2026-09-08" onSelect={() => {}} state="loaded" />,
    );
    expect(document.querySelector(".tile-frame")?.getAttribute("data-roll")).toBeNull();
  });

  it("the base edition sets up no wrap — the seam there stays in the line layer", () => {
    render(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(document.querySelector(".cal-month-edges")).not.toBeNull();
    expect(screen.getByTestId("day-2026-09-01").getAttribute("style")).not.toContain("grid-row");
    expect(screen.queryByTestId("month-gap-2026-09-01")).toBeNull();
  });
});

/**
 * The lens in the "field" edition re-tasks the LIGHT (DESIGN §5.2): it stops answering "how full
 * was the day" and answers "did this one thing happen", with the live run burning brightest — so
 * the length of the lit stretch is the streak, read without a numeral.
 */
describe("Calendar — the streak's light under a lens (\"field\" edition)", () => {
  /** Stretching done on Friday the 12th and again Mon–Thu the 15th–18th: a run across a weekend. */
  function buildRunWindow(): DaySummary[] {
    const done = (iso: string) => iso === "2026-06-12" || (iso >= "2026-06-15" && iso <= TODAY);
    return buildWindow().map((d) => ({
      ...d,
      disciplineCounts: { stretch: done(d.date) ? 1 : 0, reading: 2 },
    }));
  }

  function renderRun() {
    return render(
      <Calendar
        days={buildRunWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        lens={STRETCH_LENS}
      />,
    );
  }

  it("the days of a live streak glow, a stepped-over weekend glows at half strength", () => {
    renderRun();

    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-lens-run", "on");
    expect(screen.getByTestId("day-2026-06-15")).toHaveAttribute("data-lens-run", "on");
    // Sat/Sun inside the run: neutral for a discipline item, so they hold the stretch together
    // instead of cutting it in two.
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-lens-run", "step");
    expect(screen.getByTestId("day-2026-06-14")).toHaveAttribute("data-lens-run", "step");
  });

  it("a day before the streak broke gets no light", () => {
    renderRun();

    expect(screen.getByTestId("day-2026-06-11")).not.toHaveAttribute("data-lens-run");
  });

  it("the streak length is in words in the label — where the light draws it", () => {
    renderRun();

    expect(screen.getByTestId("calendar-lens-run")).toHaveTextContent("5 дней подряд");
  });

  it("a one-day streak gets no label: it is not a streak yet", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        lens={STRETCH_LENS}
      />,
    );

    expect(screen.queryByTestId("calendar-lens-run")).toBeNull();
  });

  it("no outline on the figure in the \"field\": the light already says the same", () => {
    renderRun();

    expect(screen.queryByTestId(`lens-frame-${TODAY}`)).toBeNull();
    // ...while the base grid keeps the ring as the lens's only mark (§5.1).
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-lens-tone", "match");
  });

  it("the base grid knows nothing of the streak's light: it is the \"field\" material", () => {
    render(
      <Calendar
        days={buildRunWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );

    expect(screen.getByTestId(`day-${TODAY}`)).not.toHaveAttribute("data-lens-run");
    expect(screen.queryByTestId("calendar-lens-run")).toBeNull();
  });
});
