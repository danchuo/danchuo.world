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
    contributions: null,
    disciplineDone: 0,
    disciplineTotal: 5,
    // Растяжка сделана по чётным числам — материал для линзы.
    disciplineCounts: { stretch: Number(date.slice(8)) % 2 === 0 ? 1 : 0, reading: 2 },
    monster:
      date === "2026-06-20" ? { key: "mango-loco", name: "Mango Loco", accentColor: "#F4A52A" } : null,
  }));
}

const STRETCH_LENS = { key: "stretch", occurrence: 1, label: "растяжка" };

describe("Calendar — колонка выходных", () => {
  it("будущий выходной остаётся выходным, а не будущим днём", () => {
    // Приоритет заливки: соседний месяц → выходной → будущее. Окно наполовину состоит из
    // будущего, и без этого правила половина колонки сб/вс красилась бы «будущим» —
    // колонка выходных обрывалась бы на сегодняшнем дне.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 20 и 21 июня 2026 — суббота и воскресенье, обе позже TODAY (18-е, четверг).
    for (const date of ["2026-06-20", "2026-06-21"]) {
      const cell = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(cell).toContain("var(--cal-weekend)");
      expect(cell).not.toContain("var(--bg-surface-muted)");
    }
  });

  it("прошедший выходной красится тем же токеном, что и будущий", () => {
    // Колонка обязана читаться сплошной сверху донизу — иначе «выходной» превращается
    // в оттенок «когда», а это уже занятый канал.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const past = screen.getByTestId("day-2026-06-13").getAttribute("style") ?? "";
    const future = screen.getByTestId("day-2026-06-20").getAttribute("style") ?? "";
    expect(past).toContain("var(--cal-weekend)");
    expect(future).toContain("var(--cal-weekend)");
  });
});

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

  it("без линзы ячейки не размечены её ответом (календарь прежний)", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId("day-2026-06-16")).not.toHaveAttribute("data-lens");
    expect(screen.getByText("календарь")).toBeInTheDocument();
  });

  it("линза размечает дни: совпал / не совпал / нет ответа", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    // прошедший день с данными, растяжка была
    expect(screen.getByTestId("day-2026-06-16")).toHaveAttribute("data-lens", "yes");
    // прошедший день с данными, растяжки не было
    expect(screen.getByTestId("day-2026-06-17")).toHaveAttribute("data-lens", "no");
    // дырка в записи и будущий день ответа не дают — «не сделал» им не приписываем
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-lens", "unknown");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-lens", "unknown");
  });

  it("совпавший день несёт рамку-отметку, заливка ячейки при этом не трогается", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("lens-frame-2026-06-16")).toBeInTheDocument();
    // не совпал / нет ответа — рамки нет
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
    // заливка выходного осталась своей: линза её не подменяет (вопрос «когда» неприкосновенен)
    const weekend = screen.getByTestId("day-2026-06-13");
    expect(weekend.getAttribute("style")).toContain("var(--cal-weekend)");
    expect(weekend.getAttribute("style")).not.toContain("color-mix");
  });

  it("линза не отбирает у ячейки её собственные состояния (пропуск/выходной/сегодня)", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
  });

  it("ответ линзы едет в ховер-сводку и подпись для скринридера", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16").getAttribute("title")).toContain("растяжка: сделано");
    expect(screen.getByTestId("day-2026-06-17").getAttribute("aria-label")).toContain(
      "растяжка: не сделано",
    );
    // дню без данных линза ничего не приписывает
    expect(screen.getByTestId(`day-${GAP}`).getAttribute("title")).not.toContain("растяжка");
  });

  it("ярлык плитки называет линзу и даёт снять её крестиком", async () => {
    const onLensChange = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
        onLensChange={onLensChange}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("растяжка");
    await userEvent.click(screen.getByTestId("calendar-lens-reset"));
    expect(onLensChange).toHaveBeenCalledWith(null);
  });

  it("ярлык линзы монстра разворачивает полярность: «не пил монстр», а не «монстр»", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={{ key: "monster", occurrence: 1, label: "монстр" }}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("календарь — не пил монстр");
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
