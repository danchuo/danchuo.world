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
  it("рендерит дату, имя дня и карту-тропу дисциплины (статы/тренировка переехали, монстр — детур карты)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);

    expect(screen.getByTestId("today-date")).toHaveTextContent("18 июня 2026");
    expect(screen.getByTestId("today-title")).toHaveTextContent("первый забег");
    // Шаги, сон и тренировка переехали из «Сегодня» на свои виджеты — здесь их строк больше нет.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.queryByText(/сон/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8.421/)).not.toBeInTheDocument();
    expect(screen.queryByText(/тренировка/)).not.toBeInTheDocument();

    // дисциплина — карта-тропа (QuestMap): чтение закрыто на обеих остановках, растяжка нет
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-stretch-1")).toHaveAttribute("data-done", "false");
    // выбран вкус ⇒ детур монстра закрыт; отдельного блока монстра внизу плитки нет
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
    expect(screen.queryByText("Mango Loco")).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-total")).toHaveTextContent("2/7");
  });

  it("пустой день: null → «нет данных», детур монстра не закрыт, пометки «не пил» нет", () => {
    const empty = dayFixture({
      title: null,
      hasData: false,
      health: { steps: null, sleepMinutes: null, sleepStages: null },
      workouts: [],
      monster: null,
    });
    render(<TodayTile day={empty} today="2026-06-18" state="loaded" />);

    expect(screen.queryByTestId("today-title")).not.toBeInTheDocument();
    // Без тренировки и без статов — только шапка + карта; строки статов в плитке нет.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.queryByText(/тренировка/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "false");
    expect(screen.queryByTestId("monster-none")).not.toBeInTheDocument();
  });

  it("длинное имя дня не переносится: кегль ужимается, шапка остаётся одной строкой", () => {
    const long = "очень длинное имя дня про всё на свете"; // 38 символов, > 20
    render(<TodayTile day={dayFixture({ title: long })} today="2026-06-18" state="loaded" />);

    const title = screen.getByTestId("today-title");
    expect(title.className).toContain("whitespace-nowrap");
    expect(title.className).toContain("w-3/5"); // имя дня получает 3/5 строки
    // 96/38 cqw ≈ 2.53cqw < общего 4cqw — имя влезает в свою 3/5 одной строкой
    expect(title.style.fontSize).toBe("min(4cqw, 40px, 2.53cqw)");
  });

  it("короткое имя дня держит общий кегль со строкой даты (мин не срабатывает)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);
    // «первый забег» — 12 символов: 96/12 = 8cqw > 4cqw, размер остаётся 4cqw
    expect(screen.getByTestId("today-title").style.fontSize).toBe("min(4cqw, 40px, 8.00cqw)");
  });

  it("подпись плитки относительна выбранной дате (а не всегда «сегодня»)", () => {
    // Выбран 17-е при сегодня 18-м → «вчера».
    render(<TodayTile day={dayFixture({ date: "2026-06-17" })} today="2026-06-18" state="loaded" />);
    expect(screen.getByText("вчера")).toBeInTheDocument();
    expect(screen.queryByText("сегодня")).not.toBeInTheDocument();
  });

  it("в состоянии loading показывает шиммер, а не контент", () => {
    render(<TodayTile day={null} today="2026-06-18" state="loading" />);
    expect(screen.getByTestId("tile-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("today-date")).not.toBeInTheDocument();
  });

  // --- Выходной: сцена отдыха вместо карты-тропы (§5.6) ---------------------------------------

  it("выходной с волной-сценой: карта уступает место сцене отдыха, чеклист монстра ✓ (не пил)", () => {
    // 2026-06-21 — воскресенье; монстр не пит ⇒ чеклист-галочка, без стриков.
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-21", monster: null })}
        today="2026-06-21"
        state="loaded"
        wave="wave-01"
      />,
    );
    expect(screen.getByTestId("weekend-scene")).toBeInTheDocument();
    expect(screen.queryByTestId("quest-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("weekend-monster")).toHaveTextContent("монстр — не пил");
  });

  it("выходной, монстр пил: чеклист монстра словами", () => {
    // dayFixture по умолчанию ставит вкус mango-loco ⇒ монстр пил.
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("weekend-monster-mark")).toHaveTextContent(/^пил$/);
  });

  it("будний день держит карту-тропу даже на волне со сценой", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-18" })} today="2026-06-18" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });

  it("выходной без волны-сцены: сцены нет, остаётся карта (грациозный фолбэк)", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-02" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });
});
