import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { StatsTile } from "./StatsTile";

/**
 * jsdom has no ResizeObserver, so the plot itself is never measured and the SVG stays unrendered
 * (see [useBoxSize]). Everything asserted here lives in the caption band and the rail — which is
 * exactly where this edition's controls and figures are.
 */

const day = (date: string, over: Partial<DaySummary> = {}): DaySummary => ({
  date,
  title: null,
  hasData: true,
  steps: 9000,
  sleepMinutes: 430,
  contributions: 4,
  disciplineCounts: {},
  monsterDrunk: null,
  ...over,
});

const history = [
  day("2026-09-14"),
  day("2026-09-15", { steps: 11000, sleepMinutes: 455, contributions: 0 }),
  day("2026-09-16", { steps: 7200, sleepMinutes: null, contributions: 12 }),
  day("2026-09-17", { steps: 12345, sleepMinutes: 473, contributions: 7 }),
];

function mount(over: { selected?: string; onSelectDay?: (d: string) => void } = {}) {
  return render(
    <StatsTile
      history={history}
      selected={over.selected ?? "2026-09-17"}
      state="loaded"
      edition="ghosts"
      onSelectDay={over.onSelectDay}
    />,
  );
}

/** jsdom's pointer events carry no `pointerType`, and that field is the whole subject here. */
function point(el: HTMLElement, type: string, pointerType: string, clientX: number) {
  const ev = new Event(type, { bubbles: true });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  Object.defineProperty(ev, "clientX", { value: clientX });
  fireEvent(el, ev);
}

/** The plot itself needs a measured box: hand one over, and the SVG — crosshair included — draws. */
function mountMeasured() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        this.cb([{ contentRect: { width: 420, height: 300 } } as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  const view = mount();
  vi.unstubAllGlobals();
  return view;
}

describe("StatsTile — редакция «призраки»", () => {
  it("рисует все метрики, а переключатель называет каждую", () => {
    mount();
    const rail = screen.getByRole("group", { name: "метрика" });
    const segs = rail.querySelectorAll("button");
    expect(segs).toHaveLength(3);
    expect(screen.getByRole("button", { name: "метрика: шаги" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "метрика: сон" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "метрика: git" })).toHaveAttribute("aria-pressed", "false");
  });

  it("цифра в полосе — значение ВЫБРАННОГО дня, а не последнего", () => {
    mount({ selected: "2026-09-15" });
    expect(screen.getByText("11 000")).toBeInTheDocument();
  });

  it("клик по рельсу меняет освещённую метрику вместе с цифрой", async () => {
    mount();
    expect(screen.getByText("12 345")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "метрика: сон" }));
    expect(screen.getByText("7ч 53м")).toBeInTheDocument();
    expect(screen.queryByText("12 345")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "метрика: сон" })).toHaveAttribute("aria-pressed", "true");
  });

  it("клик по рельсу НЕ выбирает день: у плитки и у переключателя разные ответы", async () => {
    const onSelectDay = vi.fn();
    mount({ onSelectDay });
    await userEvent.click(screen.getByRole("button", { name: "метрика: git" }));
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("сон без записи — прочерк, потому что пропуск не ноль", async () => {
    mount({ selected: "2026-09-16" });
    await userEvent.click(screen.getByRole("button", { name: "метрика: сон" }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("нулевой git рисуется как +0: линию спрашивают «сколько», а не «было ли»", async () => {
    // The chip beside the wave-01 charts is silent on a zero because it answers "was there
    // anything at all"; a trace is asked "how much, day by day", and an empty day is an answer.
    mount({ selected: "2026-09-15" });
    await userEvent.click(screen.getByRole("button", { name: "метрика: git" }));
    expect(screen.getByText("+0")).toBeInTheDocument();
  });

  it("стрелки вверх и вниз ходят по метрикам по кругу", async () => {
    mount();
    const plot = screen.getByRole("group", { name: /^График/ });
    plot.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "метрика: сон" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("button", { name: "метрика: git" })).toHaveAttribute("aria-pressed", "true");
  });

  it("стрелки влево и вправо адресуют ДЕНЬ и отдают его борду", async () => {
    const onSelectDay = vi.fn();
    mount({ onSelectDay });
    screen.getByRole("group", { name: /^График/ }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onSelectDay).toHaveBeenCalledWith("2026-09-16");
  });

  it("история короче окна — метка окна занимает всю полосу, а не уезжает за левый край", () => {
    // The honest arithmetic gave `left: -250%` on four days: there is nowhere to scrub to, so the
    // window IS the whole history.
    const { container } = mount();
    const at = container.querySelector(".stats-ghosts__run-at") as HTMLElement;
    expect(at.style.left).toBe("0%");
    expect(at.style.width).toBe("100%");
  });

  it("молчащий канал плитку не открывает: освещается первая метрика С ДАННЫМИ", () => {
    // Steps lag behind the phone's shortcut and can be empty for weeks. Opening on an empty
    // channel made the widget look broken — measured on the live stack, where the last two weeks
    // had no steps at all (the older half of the range did, which is why the window is what counts).
    const noSteps = history.map((d) => ({ ...d, steps: null }));
    render(<StatsTile history={noSteps} selected="2026-09-17" state="loaded" edition="ghosts" />);
    expect(screen.getByRole("button", { name: "метрика: сон" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "метрика: шаги" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("7ч 53м")).toBeInTheDocument();
  });

  it("метрика выбирается по ОКНУ, а не по всей выборке", () => {
    // Measured on the live stack: steps filled the older half of the 30 days and were empty in the
    // last two weeks, so a whole-range check still opened on steps and still showed a dash.
    const older = Array.from({ length: 20 }, (_, i) =>
      day(`2026-08-${String(i + 1).padStart(2, "0")}`, { sleepMinutes: null, contributions: null }),
    );
    const recent = Array.from({ length: 16 }, (_, i) =>
      day(`2026-09-${String(i + 1).padStart(2, "0")}`, { steps: null }),
    );
    render(<StatsTile history={[...older, ...recent]} selected="2026-09-16" state="loaded" edition="ghosts" />);
    expect(screen.getByRole("button", { name: "метрика: сон" })).toHaveAttribute("aria-pressed", "true");
  });

  it("выбор читателя данные не перебивают — он главнее", async () => {
    const noSteps = history.map((d) => ({ ...d, steps: null }));
    render(<StatsTile history={noSteps} selected="2026-09-17" state="loaded" edition="ghosts" />);
    await userEvent.click(screen.getByRole("button", { name: "метрика: шаги" }));
    expect(screen.getByRole("button", { name: "метрика: шаги" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("тап пальцем не оставляет на графике перекрестие чужого дня", () => {
    // A touch emits an emulated `mousemove` and then NEVER a `mouseleave`: the crosshair stuck on
    // a day nobody chose, and beside the rail that read as the tap having moved the day.
    const { container } = mountMeasured();
    const plot = container.querySelector(".stats-ghosts") as HTMLElement;

    point(plot, "pointermove", "mouse", 200);
    expect(container.querySelector(".stats-ghosts__tip")).not.toBeNull();

    point(plot, "pointerdown", "touch", 200);
    point(plot, "pointermove", "touch", 240);
    expect(container.querySelector(".stats-ghosts__tip")).toBeNull();
  });

  it("самый СТАРЫЙ день окна мышью не берётся — он утекает за левый край", async () => {
    // The oldest day bleeds off the left edge, where a hit would be a guess. The newest one has
    // the right-hand gap and is picked like any other; the calendar reaches the oldest anyway.
    const onSelectDay = vi.fn();
    const { container } = mount({ onSelectDay });
    const plot = container.querySelector(".stats-ghosts") as HTMLElement;
    await userEvent.pointer({ target: plot, coords: { clientX: 0, clientY: 0 }, keys: "[MouseLeft]" });
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("незнакомая редакция откатывается к дефолтным полосам, а не ломает плитку", () => {
    render(<StatsTile history={history} selected="2026-09-17" state="loaded" edition="sonar" />);
    expect(screen.queryByTestId("stats-ghosts")).not.toBeInTheDocument();
    expect(screen.getByText("активность")).toBeInTheDocument();
  });
});
