import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { WaveBackdrop } from "./WaveBackdrop";

const TODAY = "2026-09-02";

function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-08-24",
    title: "тихий понедельник",
    hasData: true,
    steps: 8340,
    sleepMinutes: 432,
    contributions: 3,
    monsterDrunk: null,
    ...over,
  };
}

/** The ribbon is found by its node, not its text: the text is set imperatively by an effect. */
function ribbonOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".wave-backdrop-ribbon");
  if (!el) throw new Error("шов фона не отрендерил ленту");
  return el;
}

/**
 * The wall in jsdom: there is no layout, so both measures are stubbed. Measuring a glyph fails too
 * (the probe measures zero) and the seam falls back to a monospace estimate — exactly the path it
 * takes in a hidden tab. The model is deliberately crude: what is checked is that lines SUFFICE.
 */
function mockWall(height: number, width = 1000): () => void {
  const proto = HTMLElement.prototype;
  const client = Object.getOwnPropertyDescriptor(proto, "clientHeight");
  const clientW = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => height });
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  return () => {
    Object.defineProperty(proto, "clientHeight", client ?? { configurable: true, value: 0 });
    Object.defineProperty(proto, "clientWidth", clientW ?? { configurable: true, value: 0 });
  };
}

/** The widest plausible line height — an upper bound for counting lines. */
const MAX_LEADING_PX = 30;

let restoreWall: (() => void) | null = null;
afterEach(() => {
  restoreWall?.();
  restoreWall = null;
});

describe("WaveBackdrop", () => {
  it("шов рендерится всегда — волна включает его скином, а не наличием разметки", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-01" />);
    const root = container.querySelector(".wave-backdrop");
    expect(root).not.toBeNull();
    // The backdrop is not content: a screen reader does not read it.
    expect(root).toHaveAttribute("aria-hidden", "true");
  });

  it("кладёт в ленту прожитые дни окна календаря", () => {
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("окно без данных не оставляет на холсте мусора", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe("");
  });

  it("закрывает стену целиком, даже когда она в сотни раз выше ленты (зум наружу)", () => {
    // 60 000 against a ribbon of fifty characters is a thousand repeats. A linear "one more copy
    // per pass" hit its own ceiling long before the edge and left the canvas's bottom empty.
    restoreWall = mockWall(60_000);
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const lines = ribbonOf(container).querySelectorAll(".wave-backdrop-line");
    expect(lines.length).toBeGreaterThanOrEqual(Math.ceil(60_000 / MAX_LEADING_PX));
  });

  /**
   * Alternating alignment is a wave's rule, but it is possible only because EVERY line arrives as
   * its own node: `text-align` in CSS governs a whole paragraph, not one line. So the splitting is
   * the seam's obligation and is checked here rather than by eye on the board.
   */
  it("ломает ленту на строки-узлы, чтобы волна могла выключать их по очереди", () => {
    restoreWall = mockWall(600);
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const lines = ribbonOf(container).querySelectorAll<HTMLElement>(".wave-backdrop-line");
    expect(lines.length).toBeGreaterThan(1);
    const lengths = [...lines].map((line) => (line.textContent ?? "").length);
    // No empty lines, and lines of one length to within a word: the seam wraps by width rather
    // than the browser at its own discretion. The exact length is deliberately not asserted.
    expect(Math.min(...lengths)).toBeGreaterThan(0);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(24);
  });

  it("новое окно календаря переписывает ленту, а не дописывает её", () => {
    const { container, rerender } = render(
      <WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />,
    );
    rerender(
      <WaveBackdrop
        summaries={[day({ date: "2026-08-25", title: "день длинных созвонов" })]}
        today={TODAY}
        wave="wave-03"
      />,
    );
    const text = ribbonOf(container).textContent ?? "";
    expect(text).toContain("день длинных созвонов");
    expect(text).not.toContain("тихий понедельник");
  });
  /**
   * The ribbon is cut by a glyph MEASUREMENT, and the system face measures differently from the
   * wave's, so a layout computed before the font does not reach the edge. The recount signal is
   * the font gate (`fontGate.ts`), not `document.fonts.ready`, which answers instantly at first.
   */
  it("пересобирает ленту, когда открылись ворота шрифта", async () => {
    restoreWall = mockWall(600);
    document.documentElement.setAttribute("data-fonts", "pending");
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const ribbon = ribbonOf(container);
    const before = ribbon.querySelectorAll(".wave-backdrop-line").length;

    // The font arrived: the same wall, a narrower glyph ⇒ there must be more lines.
    restoreWall?.();
    restoreWall = mockWall(900);
    document.documentElement.setAttribute("data-fonts", "ready");

    await waitFor(() =>
      expect(ribbon.querySelectorAll(".wave-backdrop-line").length).toBeGreaterThan(before),
    );
    document.documentElement.removeAttribute("data-fonts");
  });
});
