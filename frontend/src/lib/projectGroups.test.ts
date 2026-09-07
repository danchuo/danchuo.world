import { describe, expect, it } from "vitest";
import { projectYearRows } from "./projectGroups";

/** Минимальная запись: раскладке важен только край диапазона. */
const p = (title: string, endYear: number | null) => ({ title, endYear });

describe("projectYearRows", () => {
  it("завершённый проект помечен годом своего конца", () => {
    expect(projectYearRows([p("proxemics", 2024)], 2026)).toEqual([
      { project: p("proxemics", 2024), year: 2024, startsYear: true, indexInYear: 0, yearSize: 1 },
    ]);
  });

  /**
   * Открытый конец = «идёт по настоящее», значит последняя активность — сейчас. Иначе живой
   * проект уехал бы в группу года своего НАЧАЛА и оказался внизу списка под завершёнными.
   */
  it("открытый конец → текущий год", () => {
    expect(projectYearRows([p("danchuo.world", null)], 2026)).toEqual([
      { project: p("danchuo.world", null), year: 2026, startsYear: true, indexInYear: 0, yearSize: 1 },
    ]);
  });

  /**
   * Год печатается ОДИН раз на группу — в поле первой её строки; у остальных поле пустое.
   * Это и есть подавление повтора: колонка слева отбивает группы, ничего не повторяя.
   */
  it("год печатается только у первой строки своей группы", () => {
    const rows = projectYearRows([p("a", null), p("b", 2026), p("c", 2024), p("d", 2024)], 2026);
    expect(rows.map((r) => [r.project.title, r.year, r.startsYear])).toEqual([
      ["a", 2026, true],
      ["b", 2026, false],
      ["c", 2024, true],
      ["d", 2024, false],
    ]);
  });

  /**
   * Дерево у каждого года своё — ствол растёт от года вниз (DESIGN §7.8), поэтому строка
   * несёт СВОЁ место внутри года, а не в общем списке: иначе угол закрыл бы чужую группу.
   */
  it("строка знает своё место внутри года, а не в общем списке", () => {
    const rows = projectYearRows([p("a", null), p("b", 2026), p("c", 2024)], 2026);
    expect(rows.map((r) => [r.indexInYear, r.yearSize])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  /**
   * Строки одного года стоят подряд, даже если порядок сортировки их разорвал: иначе год
   * пришлось бы печатать дважды, а он отбивает группу, а не подписывает строку.
   */
  it("разорванный порядком проект едет к своим, год не повторяется", () => {
    const rows = projectYearRows([p("a", 2026), p("b", 2024), p("c", 2026)], 2026);
    expect(rows.map((r) => [r.project.title, r.year, r.startsYear])).toEqual([
      ["a", 2026, true],
      ["c", 2026, false],
      ["b", 2024, true],
    ]);
  });

  it("пустой список → ни одной строки", () => {
    expect(projectYearRows([], 2026)).toEqual([]);
  });
});
