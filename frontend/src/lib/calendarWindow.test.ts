import { describe, expect, it } from "vitest";
import { anchorOnDay, hasEarlierWeeks, monthEdges, shiftAnchor } from "./calendarWindow";
import { datesInRange } from "./date";

const TODAY = "2026-08-04"; // a Tuesday

describe("shiftAnchor — якорь окна календаря", () => {
  it("шаг назад двигает якорь ровно на неделю", () => {
    expect(shiftAnchor(TODAY, TODAY, -1)).toBe("2026-07-28");
    expect(shiftAnchor("2026-07-28", TODAY, -1)).toBe("2026-07-21");
  });

  it("шаг вперёд возвращает якорь по той же лестнице", () => {
    expect(shiftAnchor("2026-07-21", TODAY, 1)).toBe("2026-07-28");
  });

  it("вперёд дальше сегодня якорь не уезжает", () => {
    // A future window is meaningless: there will never be data there, and the home position must
    // match "today" exactly rather than "somewhere this week".
    expect(shiftAnchor(TODAY, TODAY, 1)).toBe(TODAY);
    expect(shiftAnchor("2026-07-28", TODAY, 5)).toBe(TODAY);
  });

  it("шаг в несколько недель считается разом", () => {
    expect(shiftAnchor(TODAY, TODAY, -3)).toBe("2026-07-14");
  });
});

describe("hasEarlierWeeks — есть ли что листать назад", () => {
  const window = (from: string, ...dates: string[]) => ({ from, days: dates.map((date) => ({ date })) });

  it("окно, начавшееся ровно с запрошенного дня, историю не исчерпало", () => {
    const { from, days } = window("2026-07-13", "2026-07-13", "2026-07-14");
    expect(hasEarlierWeeks(days, from)).toBe(true);
  });

  it("окно, обрезанное генезисом, дальше не листается", () => {
    // The backend clamps `from` to genesis (DaysResource.range), so a first day LATER than
    // requested means genesis lies inside the window and there is no data before it.
    const { from, days } = window("2026-07-13", "2026-07-16", "2026-07-17");
    expect(hasEarlierWeeks(days, from)).toBe(false);
  });

  it("пустое окно целиком лежит до генезиса", () => {
    expect(hasEarlierWeeks([], "2020-01-06")).toBe(false);
  });
});

describe("monthEdges — ступенька границы месяцев", () => {
  const window = (from: string, to: string) => datesInRange(from, to).map((date) => ({ date }));
  /** "Today" is in August: July's edge and earlier are past, August's edge is the current one. */
  const NOW = "2026-08";

  it("стык внутри ряда даёт вертикаль слева от первого числа и две горизонтали", () => {
    // Window 15.06 → 12.07 (Mon→Sun). 1 July is a Wednesday, the 3rd column (index 2) of row 2.
    const { rows, cols } = monthEdges(window("2026-06-15", "2026-07-12"), 0, NOW);
    // Exactly one vertical, to the left of 1 July.
    expect(cols).toEqual([{ row: 2, col: 2 }]);
    // Horizontals: row 2's tail (Wed…Sun, June above them) and row 3's head (Mon…Tue, June above).
    expect(rows).toEqual([
      { row: 2, from: 2, to: 7 },
      { row: 3, from: 0, to: 2 },
    ]);
  });

  it("соседние клетки ряда склеиваются в один отрезок, а не в семь", () => {
    // The whole point of the function: the line is one run, not a set of per-cell pieces.
    const { rows } = monthEdges(window("2026-06-15", "2026-07-12"), 0, NOW);
    expect(rows.every((r) => r.to - r.from >= 1)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("первый ряд окна границей не метится — над ним обрез выборки, а не стык", () => {
    // The window starts on 29 June: 1 July lies in the FIRST row, with no neighbour above.
    const { rows, cols } = monthEdges(window("2026-06-29", "2026-07-26"), 0, NOW);
    expect(rows.some((r) => r.row === 0)).toBe(false);
    // The vertical is still there: 30 June lies to the left of 1 July.
    expect(cols).toContainEqual({ row: 0, col: 2 });
  });

  it("понедельничное первое число не даёт вертикали — слева от него ничего нет", () => {
    // 1 June 2026 is a Monday. Window 18.05 → 14.06: row 0 is 18–24.05, row 1 is 25–31.05, and
    // row 2 begins on 1 June.
    const { rows, cols } = monthEdges(window("2026-05-18", "2026-06-14"), 0, NOW);
    expect(cols).toEqual([]);
    // The border degenerates into a straight horizontal across the whole row.
    expect(rows).toEqual([{ row: 2, from: 0, to: 7 }]);
  });

  it("два стыка в одном окне разводятся в разные отрезки", () => {
    // February is shorter than the window: 01.02 and 01.03 fall inside the same 28 days.
    const { cols } = monthEdges(window("2026-01-26", "2026-02-22"), 0, NOW);
    expect(cols.length).toBeGreaterThanOrEqual(1);
    const { rows } = monthEdges(window("2027-01-25", "2027-02-21"), 0, "2027-08");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("уважает выравнивание окна (pad) — колонки считаются от понедельника", () => {
    // A guard for an arbitrary range: a window starting on Wednesday shifts every column by two.
    const { cols } = monthEdges(window("2026-07-01", "2026-07-14"), 2, NOW);
    expect(cols).toEqual([]); // no month edge inside the window
  });

  /**
   * The mark belongs to the month that BEGINS at the edge and is drawn only if that month is
   * strictly earlier than the current one. In the home window the border stays silent: the month
   * is already named by the "Today" tile, and a line there would be constant noise.
   */
  it("стык с текущим месяцем молчит", () => {
    // Window 20.07 → 16.08 with today in August: the 01.08 edge starts the CURRENT month.
    const { rows, cols } = monthEdges(window("2026-07-20", "2026-08-16"), 0, NOW);
    expect(rows).toEqual([]);
    expect(cols).toEqual([]);
  });

  it("стык между прошлыми месяцами рисуется", () => {
    // The same window paged back: 01.07 starts a PAST month, so it is marked.
    const { rows, cols } = monthEdges(window("2026-06-22", "2026-07-19"), 0, NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(cols).toEqual([{ row: 1, col: 2 }]); // 1 July is the Wednesday of the second row
  });

  it("стык с будущим месяцем тоже молчит", () => {
    // A window touching September with today in August: that is even less a "past month".
    const { rows, cols } = monthEdges(window("2026-08-24", "2026-09-20"), 0, NOW);
    expect(rows).toEqual([]);
    expect(cols).toEqual([]);
  });
});

describe("anchorOnDay — опора, поставленная на день (§5.3)", () => {
  it("опорой становится сам день: окно соберётся вокруг его недели", () => {
    expect(anchorOnDay("2026-06-02", "2026-09-15")).toBe("2026-06-02");
  });

  it("за «сегодня» опора не уезжает — как и при листании", () => {
    expect(anchorOnDay("2026-09-18", "2026-09-15")).toBe("2026-09-15");
  });
});
