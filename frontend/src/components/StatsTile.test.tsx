import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  disciplineCounts: {},
  monsterDrunk: null,
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

describe("StatsTile — выходные на оси графика", () => {
  /**
   * Ось графика — россыпь дат, по которой не видно ритма недели, и провалы выходных читались
   * случайными (§7.4). Метим их **подписью на оси**, а не заливкой поля: заливка выделяла
   * выходные слишком темно, а подпись занимает слот, который у выходного всё равно был бы
   * занят датой.
   */
  const week = (dates: string[]) => history(dates.map((date) => ({ date })));

  // Графики рисуются только по ЗАМЕРУ контейнера, а в jsdom нет `ResizeObserver` — без него
  // SVG не появляется вовсе и проверять нечего. Подставляем наблюдателя, сразу отдающего
  // размер: полоса живёт в пиксельной геометрии, `aspect-ratio` её тут не заменит.
  const realRO = globalThis.ResizeObserver;
  beforeAll(() => {
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [{ contentRect: { width: 320, height: 160 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterAll(() => {
    globalThis.ResizeObserver = realRO;
  });

  it("подписывает субботу и воскресенье, и только их", () => {
    // 2026-08-01 — суббота, 02 — воскресенье; 03 — понедельник, 31.07 — пятница.
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"])}
        selected="2026-08-03"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("stats-weekday-2026-08-01")).toHaveTextContent("сб");
    expect(screen.getByTestId("stats-weekday-2026-08-02")).toHaveTextContent("вс");
    expect(screen.queryByTestId("stats-weekday-2026-07-31")).toBeNull();
    expect(screen.queryByTestId("stats-weekday-2026-08-03")).toBeNull();
  });

  it("подпись выходного занимает слот даты, а не встаёт рядом с ней", () => {
    // Главное требование владельца: подписи не должны пересекаться. Слот на оси один,
    // поэтому у выходного дата не рисуется вовсе — накладываться нечему по построению.
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"])}
        selected="2026-08-03"
        state="loaded"
      />,
    );
    expect(screen.queryByTestId("stats-tick-2026-08-01")).toBeNull();
    expect(screen.queryByTestId("stats-tick-2026-08-02")).toBeNull();
  });

  it("заливки поля у выходных больше нет", () => {
    // Регрессионный якорь: заливка поля отклонена (DESIGN §7.4).
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02"])}
        selected="2026-07-31"
        state="loaded"
      />,
    );
    expect(document.querySelector('[data-testid^="stats-weekend-"]')).toBeNull();
  });
});
