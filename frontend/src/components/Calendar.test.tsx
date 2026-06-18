import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, windowAround } from "@/lib/date";
import { Calendar } from "./Calendar";

const TODAY = "2026-06-18";

function buildWindow(): DaySummary[] {
  const { from, to } = windowAround(TODAY, 15);
  return datesInRange(from, to).map((date) => ({
    date,
    title: date === TODAY ? "сегодня-день" : null,
    hasData: date <= TODAY,
    steps: date === TODAY ? 8421 : null,
    sleepMinutes: null,
    disciplineDone: 0,
    disciplineTotal: 5,
    monster:
      date === "2026-06-20" ? { key: "mango-loco", name: "Mango Loco", accentColor: "#F4A52A" } : null,
  }));
}

describe("Calendar (±15)", () => {
  it("рисует непрерывную сетку ±15 = 31 ячейка с числами дней", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(31);
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveTextContent("18");
  });

  it("помечает сегодня (aria-current) и день с монстром (пиксель акцента)", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("monster-pixel-2026-06-20")).toBeInTheDocument();
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("name-mark-2026-06-18")).toBeInTheDocument();
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
