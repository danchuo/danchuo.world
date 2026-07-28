import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "@/lib/date";
import { Calendar } from "./Calendar";

const TODAY = "2026-06-18";

/** Прошедший день, за который ничего не залилось — дырка в записи (не «ещё не наступил»). */
const GAP = "2026-06-10";

function buildWindow(today: string = TODAY): DaySummary[] {
  const { from, to } = weekWindowAround(today, 2, 1);
  return datesInRange(from, to).map((date) => ({
    date,
    title: date === today ? "сегодня-день" : null,
    hasData: date <= today && date !== GAP,
    steps: date === today ? 8421 : null,
    sleepMinutes: null,
    disciplineDone: 0,
    disciplineTotal: 5,
    monster:
      date === "2026-06-20" ? { key: "mango-loco", name: "Mango Loco", accentColor: "#F4A52A" } : null,
  }));
}

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

  it("монстр не показывается в ячейке: ни пикселя цвета, ни строки в ховер-сводке", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const cell = screen.getByTestId("day-2026-06-20");
    // Ни пикселя-акцента, ни accentColor в инлайновых стилях ячейки и её детей.
    expect(screen.queryByTestId("monster-pixel-2026-06-20")).not.toBeInTheDocument();
    expect(cell.outerHTML).not.toContain("#F4A52A");
    // Ховер-сводка и подпись для скринридера — без вкуса.
    expect(cell.getAttribute("title")).not.toContain("Mango Loco");
    expect(cell.getAttribute("title")).not.toContain("монстр");
    expect(cell.getAttribute("aria-label")).not.toContain("монстр");
    // Сама сводка при этом жива.
    expect(cell.getAttribute("title")).toContain("шаги");
  });

  it("размечает выходные и дни соседнего месяца", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 2026-06-13 — суббота; 2026-06-14 — воскресенье (сегодня 18-е = четверг).
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-14")).toHaveAttribute("data-weekend", "true");
    // 2026-06-18 — будний → метки выходного нет.
    expect(screen.getByTestId("day-2026-06-18")).not.toHaveAttribute("data-weekend");
  });

  it("отличает дырку в записи от будущего дня", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // Прошедший день без данных — пропуск: его видно пунктиром.
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    // Прошедший с данными и будущий (там данных и быть не может) — не пропуски.
    expect(screen.getByTestId("day-2026-06-11")).not.toHaveAttribute("data-gap");
    expect(screen.getByTestId("day-2026-06-25")).not.toHaveAttribute("data-gap");
    // Сегодня ещё идёт — незаполненность не дырка, и своя рамка сильнее.
    expect(screen.getByTestId(`day-${TODAY}`)).not.toHaveAttribute("data-gap");
  });

  it("помечает дни соседнего месяца, когда окно ложится на стык", () => {
    // 2026-07-02 — четверг, понедельник её недели 29 июня ⇒ окно 15.06 → 12.07 (стык месяцев).
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
    expect(screen.getByTestId("day-2026-06-15")).toHaveAttribute("data-other-month", "true");
    expect(screen.getByTestId("day-2026-07-02")).not.toHaveAttribute("data-other-month");
  });

  it("клик по дню перефокусирует (onSelect с датой)", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={onSelect} state="loaded" />,
    );
    await userEvent.click(screen.getByTestId("day-2026-06-21"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-21");
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
