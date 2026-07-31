import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { StatsTile } from "./StatsTile";

/**
 * Чип вкладов GitHub в плитке статов (§7.4, реестр I-01): «+N» рядом с шагами и сном —
 * «активность другого рода». Чип **следует за выбранным днём**, как и оба читаута.
 *
 * Правило «на нуле молчим» — не косметика: нулевых дней у владельца много подряд, и
 * ежедневный серый «+0» превратился бы в шум. Чип отвечает ровно на вопрос «гит был?».
 */
const day = (over: Partial<DaySummary>): DaySummary => ({
  date: "2026-07-28",
  title: null,
  hasData: true,
  steps: 8000,
  sleepMinutes: 400,
  contributions: null,
  disciplineDone: 0,
  disciplineTotal: 3,
  disciplineCounts: {},
  monster: null,
  ...over,
});

const history = (over: Partial<DaySummary>[]) => over.map((o) => day(o));

describe("StatsTile — чип вкладов GitHub", () => {
  it("показывает вклады выбранного дня", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", contributions: 15 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByText("+15")).toBeTruthy();
  });

  it("на измеренном нуле молчит", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-30", contributions: 0 }])}
        selected="2026-07-30"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
  });

  it("молчит и когда день не собирали", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-30", contributions: null }])}
        selected="2026-07-30"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
  });

  it("берёт цифру выбранного дня, а не последнего в истории", () => {
    render(
      <StatsTile
        history={history([
          { date: "2026-07-28", contributions: 15 },
          { date: "2026-07-29", contributions: 5 },
        ])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByTestId("stats-contributions").textContent).toBe("+15");
  });

  /**
   * Цвет — токеном волны (`--accent-code`), а не зелёным литералом: зелёный GitHub спорил бы
   * и с персиком волны 01, и с графитом Obscura — ровно за это с борда сняли цвета вкусов
   * монстра. Волна выбирает свой оттенок, правило «ноль хардкод-цветов» цело.
   */
  it("красится токеном волны, а не литералом", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", contributions: 3 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByTestId("stats-contributions").style.color).toContain("--accent-code");
  });

  /** Плитка без шагов и сна пуста и без чипа: вклады сами по себе плитку статов не наполняют. */
  it("не оживляет пустую плитку", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", steps: null, sleepMinutes: null, contributions: 3 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
    expect(screen.getByText("нет данных")).toBeTruthy();
  });
});
