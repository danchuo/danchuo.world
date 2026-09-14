import { describe, expect, it } from "vitest";
import { datesInRange, weekWindowAround } from "./date";
import { monthRowsLayout, type MonthRowsLayout } from "./calendarMonthRows";

type Day = { date: string };

const win = (from: string, to: string): Day[] =>
  datesInRange(from, to).map((date) => ({ date }));

/** Позиция дня в сетке — читаемее сырого номера слота. */
function at(days: Day[], layout: MonthRowsLayout, date: string): { row: number; col: number } {
  const slot = layout.slots[days.findIndex((d) => d.date === date)];
  return { row: Math.floor(slot / 7), col: slot % 7 };
}

describe("monthRowsLayout", () => {
  it("окно без стыка месяцев ложится обычными неделями", () => {
    const days = win("2026-06-01", "2026-06-28");
    const l = monthRowsLayout(days);
    expect(l.rows).toBe(4);
    expect(at(days, l, "2026-06-01")).toEqual({ row: 0, col: 0 });
    expect(at(days, l, "2026-06-28")).toEqual({ row: 3, col: 6 });
    expect(l.marks).toEqual([]);
  });

  it("месяц начинается с НОВОЙ строки: первое число уезжает на следующую неделю", () => {
    // 1 сентября 2026 — вторник; понедельник 31 августа остаётся последним днём своей строки.
    const days = win("2026-08-24", "2026-09-20");
    const l = monthRowsLayout(days);
    expect(at(days, l, "2026-08-31")).toEqual({ row: 1, col: 0 });
    expect(at(days, l, "2026-09-01")).toEqual({ row: 2, col: 1 });
    // Колонка дня недели при переносе не съезжает — вторник остаётся вторником.
    expect(at(days, l, "2026-09-06")).toEqual({ row: 2, col: 6 });
  });

  it("перенос стоит ровно одну неделю слотов — сетка становится на ряд выше", () => {
    const l = monthRowsLayout(win("2026-08-24", "2026-09-20"));
    expect(l.rows).toBe(5);
  });

  it("метка месяца встаёт в БОЛЬШИЙ из двух пустых кусков — вниз, если голова узкая", () => {
    // Голова новой строки — один понедельник, хвост прошлой — шесть дней: имя месяца идёт туда.
    const l = monthRowsLayout(win("2026-08-24", "2026-09-20"));
    expect(l.marks).toEqual([{ date: "2026-09-01", row: 1, from: 1, to: 7 }]);
  });

  it("…и в голову новой строки, когда шире она", () => {
    // 1 мая 2026 — пятница: голова 4 клетки против хвоста в 3.
    const l = monthRowsLayout(win("2026-04-20", "2026-05-17"));
    expect(l.marks).toEqual([{ date: "2026-05-01", row: 2, from: 0, to: 4 }]);
  });

  it("месяц, и так начавший строку, переноса не требует", () => {
    // 1 июня 2026 — понедельник: новая строка начинается сама, пустых клеток не остаётся.
    const days = win("2026-05-25", "2026-06-21");
    const l = monthRowsLayout(days);
    expect(l.rows).toBe(4);
    expect(at(days, l, "2026-06-01")).toEqual({ row: 1, col: 0 });
    expect(l.marks).toEqual([]);
    // Пустого места под имя нет — месяц называет сама клетка первого числа.
    expect(l.inline).toEqual(["2026-06-01"]);
  });

  it("первое число в самом начале окна метится в клетке: разрыву не за что зацепиться", () => {
    const l = monthRowsLayout(win("2026-06-01", "2026-06-28"));
    expect(l.inline).toEqual(["2026-06-01"]);
  });

  it("в выбранный кусок имя месяца влезает всегда — он никогда не у́же четырёх клеток", () => {
    // Голова и хвост в сумме дают ровно неделю, поэтому больший из них не бывает меньше
    // четырёх. Инвариант проверяется по всем двенадцати стыкам года — по одному на день недели.
    for (let m = 1; m <= 12; m++) {
      const first = `2026-${String(m).padStart(2, "0")}-01`;
      const { from, to } = weekWindowAround(first, 1, 2);
      const l = monthRowsLayout(win(from, to));
      const mark = l.marks.find((x) => x.date === first);
      if (!mark) continue; // месяц начался с понедельника — разрыва нет вовсе
      expect(mark.to - mark.from).toBeGreaterThanOrEqual(4);
    }
  });

  it("пустое окно не ломает раскладку", () => {
    expect(monthRowsLayout([])).toEqual({ rows: 0, slots: [], marks: [], inline: [] });
  });
});
