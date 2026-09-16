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

describe("Calendar — колонка выходных", () => {
  it("будущий выходной остаётся выходным, а не будущим днём", () => {
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

  it("прошедший выходной красится тем же токеном, что и будущий", () => {
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

describe("Calendar (окно целыми неделями)", () => {
  it("рисует непрерывную сетку из 4 целых недель = 28 ячеек с числами дней", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(28);
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveTextContent("18");
  });

  it("помечает сегодня (aria-current) и день с именем", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("name-mark-2026-06-18")).toBeInTheDocument();
  });

  it("монстр не показывается в ячейке: ни метки, ни строки в ховер-сводке", () => {
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

  it("размечает выходные и дни соседнего месяца", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 2026-06-13 is a Saturday, 2026-06-14 a Sunday (today is the 18th, a Thursday).
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-14")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-18")).not.toHaveAttribute("data-weekend");
  });

  it("отличает дырку в записи от будущего дня", () => {
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

  it("месяц не метится заливкой вовсе — ни у своих дней, ни у чужих", () => {
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

  it("цифра чужого месяца не приглушается — это тот же сигнал, что и снятая заливка", () => {
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

  it("выходной остаётся выходным в любом месяце окна", () => {
    // A regression anchor: dropping the month fill must not disturb the Sat/Sun column, which
    // used to break inside a foreign month and which has its own token because of it.
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

  it("граница месяца рисуется отрезками в своём слое, а не кусками внутри клеток", () => {
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

  it("слой границ не перехватывает клики по дням", () => {
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

  it("первое число месяца названо словом — граница говорит «где», подпись «какой»", () => {
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

  it("стык с ТЕКУЩИМ месяцем молчит — ни линии, ни подписи", () => {
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

  it("верхний край окна границей не метится — там не стык месяцев, а обрез выборки", () => {
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

  it("клик по дню перефокусирует (onSelect с датой)", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={onSelect} state="loaded" />,
    );
    await userEvent.click(screen.getByTestId("day-2026-06-21"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-21");
  });

  it("без линзы ячейки не размечены её ответом (календарь прежний)", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId("day-2026-06-16")).not.toHaveAttribute("data-lens");
    expect(screen.getByText("календарь")).toBeInTheDocument();
  });

  it("линза размечает дни: совпал / не совпал / нет ответа", () => {
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

  it("совпавший день несёт рамку-отметку, заливка ячейки при этом не трогается", () => {
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

  it("линза не отбирает у ячейки её собственные состояния (пропуск/выходной/сегодня)", () => {
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

  it("ответ линзы едет в ховер-сводку и подпись для скринридера", () => {
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

  it("ярлык плитки называет линзу и даёт снять её крестиком", async () => {
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

  it("ярлык линзы монстра называет предмет линзы: полярность теперь несут сами ячейки", () => {
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

  it("линза монстра метит ТОЛЬКО «пил» — чистые дни остаются обычными ячейками", () => {
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

  it("день без запуска шортката не считается чистым: ни отметки, ни строки «не пил»", () => {
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

  it("отмеченный «пил» не гаснет заодно: приглушение и отметка — взаимоисключающие каналы", () => {
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

  it("ховер-сводка монстра говорит тем же вердиктом, что карта-тропа", () => {
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

  it("сетка несёт собственную пропорцию — в мобильном стеке высоты ей никто не даёт", () => {
    // DESIGN §8: in bento the height comes from a board pinned to the viewport, in the stack there
    // is none, so a block derived from its parent would collapse to a strip of digits. The
    // proportion is computed from the window's week count rather than hardcoded.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByRole("grid").style.aspectRatio).toBe("7 / 4");
  });

  it("пропорции нечем задать ШИРИНУ сетки — иначе календарь выезжает за плитку", () => {
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

  it("в состоянии error показывает тихий ретрай", async () => {
    const onRetry = vi.fn();
    render(
      <Calendar days={[]} selected={TODAY} today={TODAY} onSelect={() => {}} state="error" onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByText("повторить"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("Calendar — листание прошлых недель (§5.3)", () => {
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

  it("без обработчика листания в календаре нет ни одной стрелки", () => {
    // A regression anchor: the home tile grew no chrome where there is nothing to page through.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("в домашнем положении видна только стрелка назад", () => {
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

  it("стрелка назад листает ровно на неделю", async () => {
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

  it("колесо вверх листает назад, а страницу при этом не прокручивает", () => {
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

  it("дома колесо вниз не листает и не перехватывает прокрутку страницы", () => {
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

  it("у генезиса колесо вверх молчит: листать назад уже некуда", () => {
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

  it("в сдвинутом окне колесо вниз листает вперёд", () => {
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

  it("мелкие дельты тачпада складываются в один шаг, а инерция после него глотается", () => {
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

  it("без обработчика листания колесо ничего не перехватывает", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const consumed = !fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: -100 });
    expect(consumed).toBe(false);
  });

  it("сдвинутое окно даёт шаг вперёд и возврат к сегодня", async () => {
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

  it("на границе генезиса стрелки назад нет", () => {
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

  it("сдвинутое окно называет свой месяц, а не «сегодня»", () => {
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

  it("месяц чужого года назван вместе с годом", () => {
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

  it("вид дня не зависит от положения окна — листание ничего не перекрашивает", () => {
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

  it("«сегодня» и «будущее» остаются привязанными к настоящей дате, а не к якорю", () => {
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

describe("Calendar — редакция «поле» (§5.2)", () => {
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

  it("базовая редакция поля не заводит — незнакомая волна не должна получить его случайно", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" edition="таблица" />,
    );
    expect(document.querySelector(".cal-grid--field")).toBeNull();
    // The frame and the fill stay inline, as in the base.
    expect(screen.getByTestId(`day-${TODAY}`).getAttribute("style")).toContain("border");
  });

  it("в поле клетка не несёт ни рамки, ни заливки — вид целиком за скином", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field")).not.toBeNull();
    const style = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(style).not.toContain("border:");
    expect(style).not.toContain("background:");
  });

  it("клетка несёт вес дня переменной, а не готовым цветом", () => {
    renderField();
    // Two of today's four channels arrived: steps (8421 of 10000) and discipline (both items
    // closed). Sleep and contributions are absent and honestly drag the weight down.
    const today = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(today).toMatch(/--day-weight:\s*0\.461/);
  });

  it("у будущего дня и у пропуска вес нулевой", () => {
    renderField();
    for (const date of ["2026-06-20", GAP]) {
      const style = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(style).toMatch(/--day-weight:\s*0\.000/);
    }
  });

  it("включённая линза гасит поле: свет и отметка не спорят за один тон", () => {
    renderField(buildWindow(), { lens: STRETCH_LENS, onLensChange: () => {} });
    expect(document.querySelector(".cal-grid--field[data-lens]")).not.toBeNull();
  });

  it("без линзы гасить нечего", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field[data-lens]")).toBeNull();
  });

  it("точки «есть имя» в поле нет — на «доехал ли день» отвечает свет клетки", () => {
    renderField();
    expect(screen.queryByTestId(`name-mark-${TODAY}`)).toBeNull();
    // In the base edition the dot stays: light is not counted there at all.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`name-mark-${TODAY}`)).toBeInTheDocument();
  });

  it("нативной подсказки в поле нет, а сводка дня остаётся скринридеру", () => {
    renderField();
    const cell = screen.getByTestId(`day-${TODAY}`);
    expect(cell).not.toHaveAttribute("title");
    expect(cell.getAttribute("aria-label")).toContain("шаги");
  });
})

describe("Calendar — кромка вместо стрелок (§5.2)", () => {
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

  it("клик по дню кромки забирает его в сетку, а не листает вслепую", async () => {
    const { onShiftWeeks, onFocusDay } = renderEdge();
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[3];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onFocusDay).toHaveBeenCalledWith(date);
    // A week-long step gives no such guarantee: a month break eats a row and the day stays off
    // the grid — which is why the gesture has its own anchor rather than paging.
    expect(onShiftWeeks).not.toHaveBeenCalled();
  });

  it("без обработчика «забрать в сетку» клик по кромке просто выбирает день", async () => {
    const { onSelect } = renderEdge({ onFocusDay: undefined });
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[0];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(date);
  });

  it("нативной подсказки с диапазоном недели у кромки нет", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge).not.toHaveAttribute("title");
    expect([...edge.querySelectorAll("button")].some((b) => b.hasAttribute("title"))).toBe(false);
  });

  it("недели кромок не попадают в сетку — высота сетки не зависит от них", () => {
    renderEdge();
    // A 42-day window: one week goes into the tail margin and two more do not fit the height
    // ceiling (§5.2), leaving three rows — the two past weeks and the current one.
    expect(screen.getAllByRole("gridcell")).toHaveLength(21);
  });

  it("у каждого дня кромки своя кнопка: действия у них разные", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge.tagName).not.toBe("BUTTON");
    expect(edge.querySelectorAll("button.cal-edge-cell")).toHaveLength(7);
  });

  it("клетки кромки несут вес дня — полоска светится, а не просто нумерует", () => {
    renderEdge();
    const cells = screen.getByTestId("calendar-edge-prev").querySelectorAll(".cal-edge-cell");
    const lit = [...cells].filter((c) =>
      /--day-weight:\s*0\.[1-9]/.test(c.getAttribute("style") ?? ""),
    );
    expect(lit.length).toBeGreaterThan(0);
  });

  it("в поле стрелок нет: шаг несёт кромка, глиф сказал бы то же дважды", () => {
    renderEdge({ anchor: "2026-06-04" });
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("дома строка листания не рисуется вовсе — пустой ряд читался бы дырой", () => {
    renderEdge();
    expect(document.querySelector(".cal-nav")).toBeNull();
    expect(screen.queryByTestId("calendar-edge-next")).toBeNull();
  });

  it("у сдвинутого окна появляются кромка вперёд и возврат «сегодня»", async () => {
    const { onFocusDay } = renderEdge({ anchor: "2026-06-04" });
    expect(screen.getByTestId("calendar-home")).toBeTruthy();
    const next = screen.getByTestId("calendar-edge-next").querySelectorAll("button")[0];
    const date = next.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(next);
    expect(onFocusDay).toHaveBeenCalledWith(date);
  });

  it("у генезиса кромки назад нет, а её дни достаются сетке", () => {
    renderEdge({ canGoBack: false });
    expect(screen.queryByTestId("calendar-edge-prev")).toBeNull();
    expect(screen.getAllByRole("gridcell")).toHaveLength(35);
  });

  it("«сегодня» уходит из ярлыка на нижний край плитки — строка сверху не появляется", async () => {
    const onResetWindow = vi.fn();
    renderEdge({ anchor: "2026-06-04", onResetWindow });
    const home = screen.getByTestId("calendar-home");
    expect(home.className).toContain("cal-home-pill");
    // The control row is gone from the shortcut entirely — that is why the pill moved down.
    expect(document.querySelector(".cal-nav")).toBeNull();
    await userEvent.click(home);
    expect(onResetWindow).toHaveBeenCalled();
  });

  it("«сегодня» возвращает и окно, и выбранный день", async () => {
    const onResetWindow = vi.fn();
    const { onSelect } = renderEdge({ anchor: "2026-06-04", selected: "2026-06-02", onResetWindow });
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("базовая редакция держит «сегодня» в строке листания", () => {
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

  it("«сегодня» базовой редакции возвращает выбранный день так же, как таблетка «поля»", async () => {
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

  it("базовая редакция кромок не заводит и стрелки сохраняет", () => {
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

describe("Calendar — месяц с новой строки (§5.2)", () => {
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

  it("первое число уезжает на новую строку — стык метит перенос, а не линия", () => {
    renderCross();
    // Monday 31 August stays the last day of its row; Tuesday 1 September starts the next one
    // and stands in its own weekday column.
    expect(screen.getByTestId("day-2026-08-31").getAttribute("style")).toContain("grid-row: 1");
    const first = screen.getByTestId("day-2026-09-01").getAttribute("style") ?? "";
    expect(first).toContain("grid-row: 2");
    expect(first).toContain("grid-column: 2");
    expect(document.querySelector(".cal-month-edges")).toBeNull();
  });

  it("имя месяца встаёт в пустой кусок перед ним, а не в клетку дня", () => {
    renderCross();
    const mark = screen.getByTestId("month-gap-2026-09-01");
    expect(mark).toHaveTextContent(/сентябрь/i);
    // The new row's head is one Monday, so the name moves into the previous row's wide tail:
    // the six cells left over from August.
    expect(mark.getAttribute("style")).toContain("grid-row: 1");
    expect(mark.getAttribute("style")).toContain("grid-column: 2 / 8");
    expect(screen.queryByTestId("month-mark-2026-09-01")).toBeNull();
  });

  it("сетка вырастает на ряд: перенос стоит неделю слотов", () => {
    renderCross();
    const grid = document.querySelector(".cal-grid--field") as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain("repeat(5");
    // The proportion follows the same row count, or the grid would spill out of the tile.
    expect(grid.style.aspectRatio).toBe("7 / 5");
  });

  it("с кромками перенос сетку не растит: верхняя строка уходит за край", () => {
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

  it("ход окна метится направлением — по нему скин и рисует наплыв", () => {
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

  it("базовая редакция наплыва не заводит", () => {
    const { rerender } = render(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor={SEP} onSelect={() => {}} state="loaded" />,
    );
    rerender(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor="2026-09-08" onSelect={() => {}} state="loaded" />,
    );
    expect(document.querySelector(".tile-frame")?.getAttribute("data-roll")).toBeNull();
  });

  it("базовая редакция переноса не заводит — стык там по-прежнему в слое линий", () => {
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
