import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    disciplineDone: 4,
    disciplineTotal: 7,
    monster: null,
    ...over,
  };
}

/** Ленту в разметке ищем по её узлу, а не по тексту: текст ставит эффект императивно. */
function ribbonOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".wave-backdrop-ribbon");
  if (!el) throw new Error("шов фона не отрендерил ленту");
  return el;
}

describe("WaveBackdrop", () => {
  it("шов рендерится всегда — волна включает его скином, а не наличием разметки", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-01" />);
    const root = container.querySelector(".wave-backdrop");
    expect(root).not.toBeNull();
    // Фон — не контент: скринридер его не читает.
    expect(root).toHaveAttribute("aria-hidden", "true");
  });

  it("кладёт в ленту прожитые дни окна календаря", () => {
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7",
    );
  });

  it("окно без данных не оставляет на холсте мусора", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe("");
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
});
