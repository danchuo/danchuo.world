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
    workouts: [{ type: "бег", durationMinutes: 31, activeEnergyKcal: 305, distanceMeters: 5100 }],
    discipline: [
      { key: "reading", label: "чтение", icon: null, count: 2, target: 2 },
      { key: "stretch", label: "растяжка", icon: null, count: 0, target: 1 },
    ],
    monster: { key: "mango-loco", name: "Mango Loco", imageUrl: "/m.png", accentColor: "#F4A52A" },
    ...over,
  };
}

describe("TodayTile", () => {
  it("рендерит дату, имя дня, статы, дисциплину дробями и монстра", () => {
    render(<TodayTile day={dayFixture()} state="loaded" />);

    expect(screen.getByTestId("today-date")).toHaveTextContent("18 июня 2026");
    expect(screen.getByTestId("today-title")).toHaveTextContent("первый забег");
    expect(screen.getByText(/8.421/)).toBeInTheDocument(); // шаги сгруппированы
    expect(screen.getByText(/7 ч 17 мин/)).toBeInTheDocument();
    expect(screen.getByText("Mango Loco")).toBeInTheDocument();

    // закрытый пункт помечен data-done, незакрытый — нет
    expect(screen.getByTestId("discipline-reading")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("discipline-reading")).toHaveTextContent("2/2");
    expect(screen.getByTestId("discipline-stretch")).toHaveAttribute("data-done", "false");
  });

  it("пустой день: null → «нет данных», монстр «не пил», имя не рендерится", () => {
    const empty = dayFixture({
      title: null,
      hasData: false,
      health: { steps: null, sleepMinutes: null, sleepStages: null },
      workouts: [],
      monster: null,
    });
    render(<TodayTile day={empty} state="loaded" />);

    expect(screen.queryByTestId("today-title")).not.toBeInTheDocument();
    expect(screen.getByText(/шаги: нет данных/)).toBeInTheDocument();
    expect(screen.getByTestId("monster-none")).toBeInTheDocument();
  });

  it("реальный 0 показывается как 0, а не «нет данных» (null ≠ 0)", () => {
    const zero = dayFixture({ health: { steps: 0, sleepMinutes: null, sleepStages: null } });
    render(<TodayTile day={zero} state="loaded" />);
    expect(screen.getByText(/шаги: 0$/)).toBeInTheDocument();
  });

  it("в состоянии loading показывает шиммер, а не контент", () => {
    render(<TodayTile day={null} state="loading" />);
    expect(screen.getByTestId("tile-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("today-date")).not.toBeInTheDocument();
  });
});
