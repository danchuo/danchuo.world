import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "./date";
import { FIELD_ROWS, splitFieldWindow } from "./calendarEdge";

/**
 * Окно борда для редакции «поле»: две прошлые недели и текущая, плюс по неделе на кромку
 * с каждого края. Вперёд окно не заходит — будущая неделя живёт только в кромке.
 */
function window(today: string): DaySummary[] {
  const { from, to } = weekWindowAround(today, 3, 1);
  return datesInRange(from, to).map((date) => ({ date }) as DaySummary);
}

const dates = (days: readonly { date: string }[]) => days.map((d) => d.date);
const at = (w: ReturnType<typeof splitFieldWindow>, date: string) =>
  w.grid.find((p) => p.day.date === date);

describe("splitFieldWindow", () => {
  it("окно без стыка месяцев: неделя в кромку, три в сетку, неделя в хвост", () => {
    // Июнь 2026 начинается с понедельника — переноса месяца в окне нет.
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toEqual(datesInRange("2026-05-25", "2026-05-31"));
    expect(dates(w.grid.map((p) => p.day))).toEqual(datesInRange("2026-06-01", "2026-06-21"));
    expect(dates(w.after)).toEqual(datesInRange("2026-06-22", "2026-06-28"));
    expect(w.rows).toBe(3);
  });

  it("день несёт свои координаты в сетке", () => {
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(at(w, "2026-06-01")).toMatchObject({ row: 0, col: 0 });
    expect(at(w, "2026-06-21")).toMatchObject({ row: 2, col: 6 });
  });

  it("перенос месяца не растит сетку: строк по-прежнему три", () => {
    // 1 сентября 2026 — вторник, и перенос добавляет строку. Лишней становится верхняя.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.rows).toBe(3);
    expect(at(w, "2026-09-01")).toMatchObject({ row: 0, col: 1 });
    expect(at(w, "2026-09-20")).toMatchObject({ row: 2, col: 6 });
    // 31 августа осталось за верхним краем — оно в одном шаге назад.
    expect(at(w, "2026-08-31")).toBeUndefined();
  });

  it("кромка — строка, которая въедет следующим шагом, а не календарная неделя", () => {
    // Перенос месяца отдал 31 августа отдельную строку. Отвечать неделей 24..30 значило бы
    // обещать не то: шаг назад приводит 31-е, а 31-е при этом не показано ВООБЩЕ — ни в
    // сетке, ни в кромке. Полоска обязана показывать ровно то, что въедет.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toEqual(["2026-08-31"]);
  });

  it("шаг назад приводит в сетку ровно то, что стояло в кромке", () => {
    const home = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    const back = splitFieldWindow(window("2026-09-08"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    const topRow = back.grid.filter((p) => p.row === 0).map((p) => p.day.date);
    expect(topRow).toEqual(dates(home.before));
    // И полоска на новом месте показывает уже следующую строку, а не ту же самую.
    expect(dates(back.before)).toEqual(datesInRange("2026-08-24", "2026-08-30"));
  });

  it("без стыка месяцев строка и есть целая неделя", () => {
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toHaveLength(7);
  });

  it("срезанная метка месяца уезжает в клетку первого числа", () => {
    // Имя сентября стояло в пустом хвосте верхней строки, а её больше нет: месяц не может
    // остаться безымянным, и его называет сама клетка — как при начале с понедельника.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.marks).toEqual([]);
    expect(w.inline).toContain("2026-09-01");
  });

  it("уцелевшая метка остаётся меткой куска", () => {
    // Шаг назад от предыдущего случая: строка с 31 августа теперь верхняя в сетке, и её
    // пустой хвост снова носит имя месяца.
    const w = splitFieldWindow(window("2026-09-08"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(at(w, "2026-08-31")).toMatchObject({ row: 0, col: 0 });
    expect(w.marks).toEqual([{ date: "2026-09-01", row: 0, from: 1, to: 7 }]);
    expect(w.inline).not.toContain("2026-09-01");
  });

  it("у генезиса строки НЕ срезаются: срезанное стало бы недостижимым", () => {
    // Кромки назад нет, шагнуть некуда — спрятанная строка пропала бы совсем.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: false, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.rows).toBe(5);
    expect(at(w, "2026-08-24")).toMatchObject({ row: 0, col: 0 });
  });

  it("хвостовая неделя отрезается ВСЕГДА — иначе высота сетки гуляла бы", () => {
    // Дома шага вперёд нет, но будущая неделя всё равно не должна попасть в сетку:
    // рисовать её или нет — решает компонент, а сетка обязана остаться в три ряда.
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.after).toHaveLength(7);
    expect(w.grid).toHaveLength(21);
  });

  it("короткое окно кромке ничего не отдаёт", () => {
    const days = datesInRange("2026-06-08", "2026-06-21").map((date) => ({ date }) as DaySummary);
    const w = splitFieldWindow(days, { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.grid).toHaveLength(7);
    expect(w.after).toHaveLength(7);
  });

  it("без кромок всё окно достаётся сетке", () => {
    // Борд не расширял окно ⇒ резать нечего: кромка не может показывать дни, которых нет,
    // а срезанная строка стала бы недостижимой.
    const w = splitFieldWindow(window("2026-09-15"), { edges: false, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.after).toEqual([]);
    expect(w.grid).toHaveLength(35);
  });

  it("пустое окно не ломает нарезку", () => {
    const w = splitFieldWindow([], { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w).toEqual({ before: [], grid: [], after: [], marks: [], inline: [], rows: 0 });
  });
});
