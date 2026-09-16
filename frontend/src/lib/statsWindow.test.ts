import { describe, expect, it } from "vitest";
import { STATS_SPAN, statsWindow } from "./statsWindow";

const TODAY = "2026-08-04";

describe("statsWindow — выборка графиков следует за выбранным днём", () => {
  it("первое окно кончается сегодня", () => {
    expect(statsWindow(TODAY, TODAY, null)).toEqual({ from: "2026-07-06", to: TODAY });
  });

  it("длина окна — STATS_SPAN дней", () => {
    const { from, to } = statsWindow(TODAY, TODAY, null);
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    expect(days).toBe(STATS_SPAN);
  });

  it("выбор дня ВНУТРИ окна не двигает его и не плодит запрос", () => {
    // The same object comes back: comparison by reference silences the refetch at effect level.
    const current = statsWindow(TODAY, TODAY, null);
    expect(statsWindow("2026-07-20", TODAY, current)).toBe(current);
  });

  it("выбор дня за окном переносит окно и оставляет запас вперёд", () => {
    // The margin is what keeps moving FORWARD through days from refetching on every step.
    const current = statsWindow(TODAY, TODAY, null);
    const next = statsWindow("2026-06-24", TODAY, current);
    expect(next.to).toBe("2026-07-03"); // the selected day plus the margin
    expect(next.from).toBe("2026-06-04");
    expect(next).not.toBe(current);
  });

  it("окно не уезжает в будущее: правый край упирается в сегодня", () => {
    const current = statsWindow(TODAY, TODAY, null);
    // A future day can be selected in the calendar — there is no data for it and never will be.
    expect(statsWindow("2026-08-20", TODAY, current)).toBe(current);
  });

  it("день у самого края окна запаса не требует", () => {
    const current = statsWindow(TODAY, TODAY, null);
    expect(statsWindow(current.from, TODAY, current)).toBe(current);
    expect(statsWindow(current.to, TODAY, current)).toBe(current);
  });

  it("прыжок в прошлое и обратно к сегодня возвращает окно к сегодня", () => {
    const first = statsWindow(TODAY, TODAY, null);
    const past = statsWindow("2026-05-01", TODAY, first);
    const back = statsWindow(TODAY, TODAY, past);
    expect(back.to).toBe(TODAY);
    expect(back.from).toBe(first.from);
  });
});
